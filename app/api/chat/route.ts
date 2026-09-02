import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { scheduleTools, systemPrompt } from "@/lib/chatTools";
import { isOffline } from "@/lib/settings";

/**
 * 챗봇. `POST /api/chat` 로 한 마디 보내고 **SSE**로 답을 받는다.
 *
 * Claude Agent SDK 를 쓴다. SDK 는 Claude Code 실행 파일을 **자식 프로세스로 띄우므로**
 * Node 런타임이 필요하다 (Edge에서는 못 돈다). 이 앱은 `node:sqlite` 때문에 이미
 * Node 런타임이라 새로 제약이 생기는 것은 없다.
 *
 * 멀티턴은 `sessionId` 왕복으로 한다. HTTP 요청은 한 번에 끝나므로 스트리밍 입력 모드
 * (`query()` 를 프로세스처럼 살려 두는 방식)는 여기에 맞지 않는다. 대신 응답의
 * `session_id` 를 클라이언트에 돌려주고, 다음 요청에서 `resume` 으로 이어 붙인다.
 *
 * 요청: `{ message: string, sessionId?: string }`
 * 응답: `text/event-stream` — 아래 SSE 이벤트를 흘린다.
 *   session  `{ sessionId }`      다음 요청에 그대로 돌려보낼 값
 *   delta    `{ text }`           답이 만들어지는 대로 토큰 단위
 *   tool     `{ name }`           도구를 부르는 중 (화면에 "일정을 찾는 중" 표시용)
 *   done     `{ cost, turns }`    한 턴 끝. cost 는 이 세션 **누적** USD
 *   error    `{ message }`
 */

export const runtime = "nodejs";

/** 이 챗봇이 쓸 수 있는 도구 — 우리 것만. */
const SCHEDULE_TOOLS = [
  "mcp__schedule__list_events",
  "mcp__schedule__search_events",
  "mcp__schedule__list_holidays",
  "mcp__schedule__leave_balance",
  "mcp__schedule__create_event",
];

/** 한 번에 도구를 몇 번까지 부를 수 있나. 무한 루프에 요금이 붙는 것을 막는다. */
const MAX_TURNS = 12;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  /**
   * 오프라인(내부망) 모드면 **요청을 만들지도 않고** 되돌린다.
   *
   * `lib/settings.ts` 의 규칙을 그대로 따른다 — 화면에서만 감추면 서버는 여전히
   * 밖으로 나가려다 타임아웃을 먹는다. 챗봇은 특히 그렇다: Agent SDK 는 자식 프로세스를
   * 띄운 **뒤에** 네트워크 실패를 만나므로, 여기서 막지 않으면 프로세스 기동 비용을
   * 내고 나서 실패한다.
   */
  if (isOffline()) {
    return Response.json(
      { error: "오프라인 모드입니다. 챗봇은 인터넷 연결이 필요합니다. 달력과 일정은 그대로 쓸 수 있습니다." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  const { message, sessionId } = (body ?? {}) as { message?: unknown; sessionId?: unknown };

  if (typeof message !== "string" || message.trim() === "") {
    return Response.json({ error: "message가 비어 있습니다." }, { status: 400 });
  }
  if (sessionId !== undefined && typeof sessionId !== "string") {
    return Response.json({ error: "sessionId는 문자열이어야 합니다." }, { status: 400 });
  }

  const options: Options = {
    model: "claude-opus-5",
    systemPrompt: systemPrompt(),

    mcpServers: { schedule: scheduleTools },

    /**
     * 파일·bash·웹을 막는 방법 — **두 겹으로 간다.**
     *
     * 1차는 `dontAsk` — 아무것도 묻지 않고 사전 승인된 것만 허용한다. 승인 목록에는
     * 우리 도구만 넣는다.
     *
     * 그런데 이것만으로 부족하다. 실측해 보니 **권한 검사를 요구하지 않는 메타 도구는
     * 그냥 실행된다** (도구 정의를 훑는 `ToolSearch` 가 승인 목록에 없는데도 돌았다).
     * `ToolSearch` 자체는 무해하지만, "목록에 없으면 전부 거부"라는 가정은 틀렸다.
     *
     * 그래서 2차로 되돌릴 수 없는 내장 도구를 이름으로 못 박아 막는다. 목록이 SDK
     * 버전에 따라 낡을 수 있으므로 1차를 대체하는 게 아니라 **덧대는** 것이다.
     */
    permissionMode: "dontAsk",
    allowedTools: SCHEDULE_TOOLS,
    disallowedTools: [
      "Write",
      "Edit",
      "NotebookEdit",
      "Bash",
      "BashOutput",
      "KillShell",
      "WebFetch",
      "WebSearch",
      "Task",
    ],

    // 우리 서버만 쓴다. 프로젝트·사용자 설정의 MCP 서버를 끌어오지 않는다.
    strictMcpConfig: true,

    /**
     * 고객님의 Claude Code 설정을 이 챗봇에 싣지 않는다.
     * 비워 두지 않으면 `~/.claude/` 와 이 프로젝트 `.claude/` 의 스킬·커맨드·CLAUDE.md가
     * 시스템 프롬프트에 실려서, 위 systemPrompt 와 싸운다.
     */
    settingSources: [],

    includePartialMessages: true,
    maxTurns: MAX_TURNS,

    // 이어 붙이기. 첫 턴에는 undefined 라 새 세션이 만들어진다.
    resume: sessionId,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        for await (const msg of query({ prompt: message, options })) {
          switch (msg.type) {
            case "system":
              if (msg.subtype === "init") send("session", { sessionId: msg.session_id });
              break;

            case "stream_event": {
              const ev = msg.event;
              if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                send("delta", { text: ev.delta.text });
              }
              break;
            }

            case "assistant":
              for (const block of msg.message.content) {
                if (block.type === "tool_use") send("tool", { name: block.name });
              }
              break;

            case "result":
              if (msg.subtype === "success") {
                send("done", { cost: msg.total_cost_usd, turns: msg.num_turns });
              } else {
                // maxTurns 초과나 예산 초과. 사용자에게 왜 끊겼는지 알려야 한다.
                send("error", { message: `끝내지 못했습니다 (${msg.subtype})` });
              }
              break;
          }
        }
      } catch (error) {
        // 단발 query() 는 오류 result 를 흘린 **뒤에** 던진다. 위에서 이미
        // error 이벤트를 보냈을 수 있으므로 문구만 덧붙이고 스트림은 정상 종료한다.
        send("error", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // 프록시가 SSE를 버퍼링하면 스트리밍이 통째로 죽는다
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
