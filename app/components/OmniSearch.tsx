"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/events";
import { isChosungQuery, matchesChosung } from "@/lib/hangul";
import EventList from "./EventList";
import { SEARCH_INPUT_ID } from "./Shortcuts";

/**
 * 일정 찾기 — **입력창 하나**로 키워드 검색과 챗봇을 함께 쓴다.
 *
 * 한때 검색창과 챗봇 입력창을 위아래로 따로 두었는데, 그러면 **두 줄이 되어** 그만큼
 * 달력이 아래로 밀렸다. 게다가 사용자 입장에서 "치과"를 어디에 쳐야 하는지가 매번
 * 판단거리가 된다 — 둘 다 '일정을 찾는' 입력창이라 나눌 이유가 없었다.
 *
 * 그래서 하나로 합치되 **망에 따라 할 수 있는 일이 달라진다**:
 *   오프라인 — 키워드 검색만. 챗봇은 밖에 닿아야 해서 애초에 못 쓴다.
 *   온라인 — 키워드 검색 + 그 말을 그대로 챗봇에게 넘기기.
 *
 * 엔터는 **언제나 키워드 검색**이다. 즉시 끝나고 공짜이며 결과가 정확하기 때문이다.
 * 챗봇은 결과 팝업 안에서 **한 번 더 눌러야** 돈다 — 토큰 요금이 붙는 일을
 * 검색할 때마다 자동으로 태우지 않는다.
 */

type Turn = {
  role: "user" | "assistant";
  text: string;
  /** 이 턴에서 부른 도구 이름들. 답을 기다리는 동안 뭘 하는지 보여 준다 */
  tools?: string[];
};

/**
 * 도구 이름을 사람 말로. `mcp__schedule__list_events` → "일정을 찾는 중"
 *
 * 여기 없는 이름은 **그대로 찍지 않는다.** SDK가 자기 내장 도구(`ToolSearch` 등)를
 * 부르는 경우가 있는데, 그 이름이 화면에 나오면 사용자에게 아무 뜻도 없는 데다
 * 내부 구현이 새어 나온다.
 */
const TOOL_LABEL: Record<string, string> = {
  mcp__schedule__list_events: "일정을 찾는 중",
  mcp__schedule__search_events: "일정을 검색하는 중",
  mcp__schedule__list_holidays: "공휴일을 보는 중",
  mcp__schedule__leave_balance: "연차 잔고를 세는 중",
  mcp__schedule__create_event: "일정을 추가하는 중",
};

const TOOL_FALLBACK = "확인하는 중";

export default function OmniSearch({
  offline = false,
  chat = true,
}: {
  offline?: boolean;
  /** 챗봇을 쓸 수 있나. 배포본에서는 꺼 둔다 — `lib/settings.ts`의 isChatEnabled 참고 */
  chat?: boolean;
}) {
  /* 오프라인이면 밖으로 못 나가고, 꺼 뒀으면 서버에 붙을 것 자체가 없다. 둘 다 결과는 같다 */
  const canChat = chat && !offline;

  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [query, setQuery] = useState("");
  /** 팝업에 띄운 결과가 어떤 말로 찾은 것인지 — 입력창을 계속 고쳐도 제목은 안 흔들린다 */
  const [asked, setAsked] = useState("");
  const [results, setResults] = useState<Event[]>([]);
  /** 결과가 30건에서 잘렸는가. 잘렸다는 사실을 숨기면 사용자는 30건이 전부라고 믿는다 */
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState(0);
  /** 서버가 준 세션 id. 다음 요청에 그대로 돌려보내면 대화가 이어진다 */
  const sessionId = useRef<string | undefined>(undefined);
  /** 이 턴에 일정을 추가했나 — 그랬으면 달력을 다시 그려야 한다 */
  const changed = useRef(false);
  /** 초성 검색용 전체 목록 캐시. 세션 동안만 유지 — 검색할 때마다 다시 받지 않는다 */
  const allEvents = useRef<Event[] | null>(null);

  // 새 줄이 붙으면 아래로 따라간다
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  /** 엔터 — 키워드 검색. 즉시 끝나고 요금이 붙지 않는다 */
  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setTruncated(false);
    setAsked(q);
    // 새 검색이면 지난 대화는 접어 둔다 — 다른 질문의 답이 위에 남아 있으면 헷갈린다
    setTurns([]);
    // **결과를 받기 전에 먼저 연다.** 실패했을 때도 팝업이 열려 있어야 오류가 보인다 —
    // 밖에 오류를 따로 그리려면 팝업이 열렸는지를 렌더 중에 읽어야 하는데,
    // ref를 렌더에서 읽으면 값이 바뀌어도 다시 그려지지 않는다(eslint react-hooks/refs).
    dialog.current?.showModal();
    try {
      // 초성만으로 이루어진 입력은 서버의 LIKE 검색으로는 못 잡는다(부분 문자열
      // 검색이라 "ㅈㄱㅎㅇ"이 "주간회의"와 글자 그대로 안 겹친다). 전체 목록을
      // 한 번 받아 클라이언트에서 초성으로 거른다 — 새 API 라우트는 필요 없다.
      if (isChosungQuery(q)) {
        if (!allEvents.current) {
          const res = await fetch(`/api/events`);
          if (!res.ok) {
            setError(`'${q}' 검색에 실패했습니다.`);
            return;
          }
          const data = (await res.json()) as { events: Event[] };
          allEvents.current = data.events;
        }
        const matched = allEvents.current.filter(
          (e) => matchesChosung(e.title, q) || matchesChosung(e.memo, q),
        );
        setResults(matched);
        setTruncated(false);
        return;
      }

      const res = await fetch(`/api/events?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setError(`'${q}' 검색에 실패했습니다.`);
        return;
      }
      const data = (await res.json()) as { events: Event[]; hasMore?: boolean };
      setResults(data.events);
      setTruncated(data.hasMore === true);
    } catch {
      setError(`'${q}' — 서버에 연결하지 못했습니다.`);
    } finally {
      setLoading(false);
    }
  }

  /** 팝업 안에서 한 번 더 눌러야 도는 쪽. 같은 말을 그대로 챗봇에게 넘긴다 */
  async function ask(message: string) {
    if (!message || busy || !canChat) return;

    setError(null);
    setBusy(true);
    changed.current = false;
    setTurns((t) => [
      ...t,
      { role: "user", text: message },
      { role: "assistant", text: "", tools: [] },
    ]);

    /** 마지막(=지금 만들어지는) assistant 턴만 고쳐 쓴다 */
    const patchLast = (fn: (t: Turn) => Turn) =>
      setTurns((all) => all.map((t, i) => (i === all.length - 1 ? fn(t) : t)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: sessionId.current }),
      });

      if (!res.ok || !res.body) {
        setError("챗봇에 연결하지 못했습니다.");
        return;
      }

      /* SSE를 손으로 파싱한다. EventSource는 GET만 되고 본문을 못 실어서 쓸 수 없다. */
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 이벤트는 빈 줄로 끝난다. 마지막 조각은 아직 안 끝났으니 버퍼에 남긴다.
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const name = /^event: (.+)$/m.exec(chunk)?.[1];
          const raw = /^data: (.+)$/m.exec(chunk)?.[1];
          if (!name || !raw) continue;
          const data = JSON.parse(raw);

          if (name === "session") sessionId.current = data.sessionId;
          else if (name === "delta") patchLast((t) => ({ ...t, text: t.text + data.text }));
          else if (name === "tool") {
            if (data.name === "mcp__schedule__create_event") changed.current = true;
            patchLast((t) => ({ ...t, tools: [...(t.tools ?? []), data.name] }));
          } else if (name === "done") setCost(data.cost);
          else if (name === "error") setError(data.message);
        }
      }
    } catch {
      // 앱의 나머지(달력·일정)는 전부 로컬이라 멀쩡하다 — `lib/fx.ts`가 환율을 못 받을 때
      // 화면을 500으로 만들지 않는 것과 같은 태도다.
      setError("연결이 끊겼습니다. 챗봇만 잠시 쓸 수 없고 달력과 일정은 그대로 씁니다.");
    } finally {
      setBusy(false);
      // 일정이 실제로 추가됐으면 Server Component를 다시 그린다.
      // 낙관적 업데이트를 흉내 내지 않는다 — DB가 단일 진실 공급원이다.
      if (changed.current) router.refresh();
    }
  }

  return (
    <>
      {/* 돋보기·입력·단추를 테두리 하나 안에 넣는다. 셋을 따로 두면 좁은 칸에서
          제각각 놀아 보이고, 무엇이 검색창인지도 한눈에 안 들어온다.
          높이를 30px로 못 박은 이유: 안에 무엇이 나타나든 줄이 커지면 그만큼
          아래 달력이 밀린다. 화면이 들썩이지 않게 하려면 높이가 고정이어야 한다. */}
      <form
        onSubmit={search}
        className="flex h-[30px] w-full items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 transition-colors focus-within:border-accent focus-within:bg-surface"
      >
        <SearchIcon />
        <input
          ref={input}
          id={SEARCH_INPUT_ID}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={canChat ? "일정 찾기 · 물어보기(챗봇)" : "일정 찾기 (키워드)"}
          aria-label="일정 찾기"
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted"
        />
        {/* 지난 대화는 **입력줄 안에** 둔다. 아래에 줄을 하나 더 만들면 첫 질문을
            던지는 순간 이 칸이 커지고, 그만큼 달력이 아래로 밀린다 */}
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            title="지난 대화 다시 보기"
            className="h-5 shrink-0 rounded-md px-1.5 text-[11px] leading-5 tabular-nums text-muted hover:bg-accent-soft hover:text-accent"
          >
            대화 {turns.filter((t) => t.role === "user").length}
          </button>
        )}
        {/* 글자를 넣기 전에는 단추를 감춘다. 늘 떠 있으면 누를 수 없는 단추가 계속 눈에 걸린다 */}
        {query.trim() !== "" && (
          <button
            type="submit"
            disabled={loading}
            className="h-5 shrink-0 rounded-md bg-accent px-2 text-[11px] font-medium leading-5 text-on-accent disabled:opacity-50"
          >
            {loading ? "찾는 중…" : "찾기"}
          </button>
        )}
      </form>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        // 팝업을 닫으면 검색창으로 돌아온다. select()까지 해 두면 곧바로 타이핑해서
        // 검색어를 갈아치울 수도, 화살표로 커서를 옮겨 한 글자만 고칠 수도 있다.
        onClose={() => {
          input.current?.focus();
          input.current?.select();
        }}
        aria-labelledby="omni-dialog-title"
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-left text-foreground shadow-lg backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id="omni-dialog-title" className="min-w-0 text-sm font-semibold">
            <span className="font-normal text-muted">&ldquo;</span>
            {asked}
            <span className="font-normal text-muted">&rdquo;</span>
            {/* 잘렸을 때 그냥 "30건"으로 적으면 전체가 30건이라는 뜻으로 읽힌다 */}
            <span className="ml-1.5 font-normal text-muted">
              {truncated ? `${results.length}건 넘음` : `${results.length}건`}
            </span>
            {cost > 0 && <span className="ml-2 font-normal text-muted">${cost.toFixed(4)}</span>}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="닫기"
            className="shrink-0 rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* 챗봇 — **켜져 있고 외부망일 때만.** 내부망이거나 배포본처럼 꺼 뒀으면
              이 자리 자체가 없다. 누를 수 없는 단추를 회색으로 남겨 두면
              "왜 안 되지"를 매번 묻게 된다 */}
          {canChat && turns.length > 0 && (
            <div className="border-b border-border px-4 py-2.5">
              {(
                <div className="space-y-3 text-xs">
                  {turns.map((turn, i) => (
                    <div key={i} className={turn.role === "user" ? "text-right" : ""}>
                      <div
                        className={
                          turn.role === "user"
                            ? "inline-block rounded-lg bg-accent-soft px-2.5 py-1.5 text-left text-foreground"
                            : "leading-relaxed text-muted"
                        }
                      >
                        {/* 도구를 부르는 중이면 무엇을 하는지 먼저 보여 준다.
                            안 보여 주면 답이 멈춘 것처럼 보인다 */}
                        {turn.tools?.map((name, j) => (
                          <p key={j} className="mb-1 text-[11px] text-accent">
                            ↳ {TOOL_LABEL[name] ?? TOOL_FALLBACK}
                          </p>
                        ))}
                        {turn.text === "" && turn.role === "assistant" ? (
                          <span className="text-muted">생각하는 중…</span>
                        ) : (
                          <span className="whitespace-pre-wrap">{turn.text}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={logEnd} />

                  {/* 이어 묻기. 팝업을 닫고 다시 검색하지 않아도 대화가 이어진다 */}
                  {!busy && <FollowUp onAsk={ask} />}
                </div>
              )}
            </div>
          )}

          {/* 잘렸다는 사실은 제목의 "넘음"만으로는 약하다. 무엇을 해야 하는지까지 적어 준다.
              정확한 전체 건수를 세지 않는 이유는 lib/events.ts의 searchEvents 주석에 있다. */}
          {truncated && (
            <p className="border-b border-border bg-accent-soft px-4 py-2 text-xs text-muted">
              가장 최근 {results.length}건만 보여 줍니다. 더 있으니 검색어를 좁혀 보세요.
            </p>
          )}

          {/* 목록의 일정을 누르면 EventItem이 이 팝업을 닫고 달력을 그 날로 옮긴다 */}
          <EventList events={results} emptyText="제목·메모에서 찾은 일정이 없습니다." />
        </div>

        {/* 챗봇으로 넘기는 단추는 **팝업 바닥 오른쪽**에 둔다.
            위에 두면 키워드 결과보다 먼저 눈에 걸리는데, 이 팝업의 본문은 검색 결과다.
            스크롤 영역 **밖**이라 결과가 길어져도 자리를 지킨다 — 안에 두면 아래로 밀려
            찾으려면 끝까지 내려야 한다.

            챗봇이 없을 때는(오프라인이거나 배포본처럼 꺼 뒀을 때) 이 줄 자체가 없다.
            누를 수 없는 단추를 회색으로 남겨 두면 "왜 안 되지"를 매번 묻게 된다. */}
        {canChat && turns.length === 0 && (
          <div className="flex justify-end border-t border-border px-4 py-2">
            <button
              type="button"
              onClick={() => ask(asked)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-50"
            >
              <ChatIcon />
              이 말로 챗봇에게 묻기
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="border-t border-border px-4 py-2 text-xs text-red-500">
            {error}
          </p>
        )}
      </dialog>

    </>
  );
}

/** 대화를 이어 갈 한 줄. 팝업 안에만 있어서 바깥 칸 높이에 영향을 주지 않는다 */
function FollowUp({ onAsk }: { onAsk: (m: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        setText("");
        onAsk(t);
      }}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="이어서 묻기"
        aria-label="이어서 묻기"
        className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted"
      />
      {text.trim() !== "" && (
        <button
          type="submit"
          className="h-5 shrink-0 rounded-md bg-accent px-2 text-[11px] font-medium leading-5 text-on-accent"
        >
          묻기
        </button>
      )}
    </form>
  );
}

/**
 * 돋보기.
 *
 * 이모지(🔍)를 쓰지 않는 이유: 글꼴마다 생김새가 제각각이고 색을 물려받지 않아
 * 주변 글자와 따로 논다. UI 아이콘은 currentColor를 따르는 SVG가 맞다.
 */
function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-3.5 w-3.5 shrink-0 text-muted"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 L14 14" />
    </svg>
  );
}

/** 말풍선. 돋보기와 같은 이유로 이모지를 쓰지 않는다 */
function ChatIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M2.5 3.5h11v8h-6l-3.5 2.5v-2.5h-1.5z" />
    </svg>
  );
}
