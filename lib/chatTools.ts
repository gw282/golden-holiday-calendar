/**
 * 챗봇이 쓰는 도구 모음.
 *
 * Claude Agent SDK 의 `createSdkMcpServer` 로 **인프로세스 MCP 서버**를 만든다.
 * 별도 프로세스나 포트가 없다 — 핸들러가 이 파일 안에서 그냥 실행된다.
 *
 * 도구는 전부 이 앱에 **이미 있는 함수**를 감싼 것이다. 쿼리를 새로 쓰지 않는다 —
 * 날짜 규칙(로컬 문자열, UTC 변환 없음)과 연차 자동 계산이 그 함수들 안에 들어 있어서,
 * 여기서 SQL을 다시 쓰면 규칙이 두 군데로 갈라진다.
 *
 * `lib/events.ts` 를 import 하므로 이 파일은 **서버 전용**이다.
 * 클라이언트 컴포넌트에서 import 하면 `node:sqlite` 가 번들로 끌려와 빌드가 깨진다.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  createEvent,
  listEventsBetween,
  searchEvents,
  ValidationError,
  type Event,
} from "./events";
import { listHolidays } from "./calendar";
import { leaveSummaries } from "./leave";
import { isValidDateStr, today } from "./date";

/* ── 공통 ─────────────────────────────────────────────────────────────── */

/** 도구 결과는 MCP 규격의 content 배열이다. 전부 텍스트로 돌려준다. */
function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

/**
 * 날짜 형식을 도구 안에서 한 번 더 막는다.
 *
 * 스키마에 `z.string()` 이라고만 적으면 모델이 "2026년 9월 2일" 같은 말을 넣어 보낼 때가
 * 있다. 그 값이 그대로 DB로 가면 `date <= ? AND end_date >= ?` 비교가 조용히 어긋난다.
 * 여기서 걸러 **모델이 읽고 고칠 수 있는 문장**으로 돌려준다.
 */
function badDate(label: string, value: string) {
  return text(`${label}가 'YYYY-MM-DD' 형식이 아닙니다: ${JSON.stringify(value)}`);
}

/** 일정 한 건을 사람이 읽는 한 줄로. 모델에게도 이 형태가 가장 값싸다. */
function line(e: Event): string {
  const span = e.endDate !== e.date ? `${e.date}~${e.endDate}` : e.date;
  const time = e.startTime ? ` ${e.startTime}${e.endTime ? `~${e.endTime}` : ""}` : " (하루 종일)";
  const marks = [
    e.done ? "완료" : null,
    e.isLeave ? "연차" : null,
    e.memo ? `메모: ${e.memo}` : null,
  ].filter(Boolean);

  return `#${e.id} ${span}${time} — ${e.title}${marks.length ? ` [${marks.join(" · ")}]` : ""}`;
}

/* ── 도구 ─────────────────────────────────────────────────────────────── */

const listEventsTool = tool(
  "list_events",
  "지정한 기간과 하루라도 겹치는 일정을 모두 준다. 기간 일정도 포함된다. " +
    "'이번 주', '다음 달' 같은 말은 먼저 YYYY-MM-DD 두 개로 바꿔서 넣어라.",
  {
    from: z.string().describe("시작일 YYYY-MM-DD"),
    to: z.string().describe("종료일 YYYY-MM-DD (포함)"),
  },
  async ({ from, to }) => {
    if (!isValidDateStr(from)) return badDate("from", from);
    if (!isValidDateStr(to)) return badDate("to", to);
    if (to < from) return text(`to(${to})가 from(${from})보다 빠릅니다.`);

    const events = listEventsBetween(from, to);
    if (events.length === 0) return text(`${from} ~ ${to} 사이에 일정이 없습니다.`);

    return text(`${from} ~ ${to} · ${events.length}건\n` + events.map(line).join("\n"));
  },
  { annotations: { readOnlyHint: true, openWorldHint: false } },
);

const searchEventsTool = tool(
  "search_events",
  "제목과 메모에서 말을 찾는다. 날짜와 무관하게 전체 기간을 훑는다. " +
    "색·공휴일·준비물은 검색 대상이 아니다. 최근 순 30건까지만 온다.",
  { query: z.string().describe("찾을 말. 부분 일치, 대소문자 무관") },
  async ({ query }) => {
    const { events, hasMore } = searchEvents(query);
    if (events.length === 0) return text(`'${query}'로 찾은 일정이 없습니다.`);

    // 잘렸으면 반드시 알린다. 안 알리면 모델이 30건을 전부라고 믿고
    // "총 30건입니다" 처럼 틀린 말을 사용자에게 한다.
    const tail = hasMore
      ? `\n(최근 ${events.length}건만 표시했습니다. 더 있으니 검색어를 좁히거나 기간을 정해 list_events를 쓰세요.)`
      : "";

    return text(`'${query}' · ${events.length}건${tail}\n` + events.map(line).join("\n"));
  },
  { annotations: { readOnlyHint: true, openWorldHint: false } },
);

const listHolidaysTool = tool(
  "list_holidays",
  "기간 안의 공휴일을 준다. 연휴를 따지거나 연차 일수를 셀 때 먼저 이걸 본다.",
  {
    from: z.string().describe("시작일 YYYY-MM-DD"),
    to: z.string().describe("종료일 YYYY-MM-DD (포함)"),
  },
  async ({ from, to }) => {
    if (!isValidDateStr(from)) return badDate("from", from);
    if (!isValidDateStr(to)) return badDate("to", to);

    const holidays = listHolidays(from, to);
    if (holidays.length === 0) return text(`${from} ~ ${to} 사이에 공휴일이 없습니다.`);

    return text(holidays.map((h) => `${h.date} ${h.name}`).join("\n"));
  },
  { annotations: { readOnlyHint: true, openWorldHint: false } },
);

const leaveBalanceTool = tool(
  "leave_balance",
  "휴가 종류별 잔고. 쓴 일수는 기간에서 주말과 공휴일을 뺀 값으로 자동 집계된 것이다.",
  {},
  async () => {
    const summaries = leaveSummaries();
    if (summaries.length === 0) return text("등록된 휴가 종류가 없습니다.");

    return text(
      summaries
        .map((s) => {
          const total = s.total === null ? "미입력" : `${s.total}일`;
          return `${s.type.name}: 총 ${total} · 쓴 ${s.used}일 · 남은 ${s.remaining ?? "?"}일 (기간 ${s.period.start}~${s.period.end})`;
        })
        .join("\n"),
    );
  },
  { annotations: { readOnlyHint: true, openWorldHint: false } },
);

const createEventTool = tool(
  "create_event",
  "일정을 추가한다. **되돌릴 수 없으니 사용자가 분명히 요청했을 때만 부른다.** " +
    "날짜가 애매하면 추측하지 말고 사용자에게 되물어라. " +
    "연차를 넣을 때는 isLeave를 true로 하면 일수가 자동으로 계산된다(반차만 leaveDays에 0.5).",
  {
    title: z.string().describe("일정 제목"),
    date: z.string().describe("시작일 YYYY-MM-DD"),
    endDate: z.string().nullish().describe("종료일 YYYY-MM-DD. 하루짜리면 비운다"),
    startTime: z.string().nullish().describe("시작 시각 HH:MM. 비우면 하루 종일"),
    endTime: z.string().nullish().describe("종료 시각 HH:MM. 시작 시각이 있을 때만 의미가 있다"),
    memo: z.string().nullish().describe("메모"),
    isLeave: z.boolean().nullish().describe("연차를 쓰는 일정인가"),
    leaveDays: z.number().nullish().describe("반차(0.5)처럼 자동값과 다를 때만. 0.25 단위"),
  },
  async (input) => {
    if (!isValidDateStr(input.date)) return badDate("date", input.date);
    if (input.endDate && !isValidDateStr(input.endDate)) return badDate("endDate", input.endDate);

    try {
      const event = createEvent({
        title: input.title,
        date: input.date,
        endDate: input.endDate ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        memo: input.memo ?? undefined,
        isLeave: input.isLeave ?? undefined,
        leaveDays: input.leaveDays ?? null,
      });
      return text(`추가했습니다.\n${line(event)}`);
    } catch (e) {
      // 검증 실패는 모델이 고칠 수 있는 정보다. 던지지 말고 문장으로 돌려준다 —
      // 던지면 도구 호출이 실패로 끝나고 모델은 무엇이 틀렸는지 모른다.
      if (e instanceof ValidationError) return text(`추가하지 못했습니다: ${e.message}`);
      throw e;
    }
  },
  // 기본값이 destructiveHint: true 다. 쓰기 도구이므로 그대로 둔다.
  { annotations: { readOnlyHint: false, openWorldHint: false } },
);

/* ── 서버 ─────────────────────────────────────────────────────────────── */

export const scheduleTools = createSdkMcpServer({
  name: "schedule",
  version: "1.0.0",
  instructions:
    "이 앱의 일정 데이터베이스를 읽고 쓴다. 일정·공휴일·연차는 반드시 이 도구로 확인한다.",
  tools: [
    listEventsTool,
    searchEventsTool,
    listHolidaysTool,
    leaveBalanceTool,
    createEventTool,
  ],
});

/**
 * 시스템 프롬프트.
 *
 * **오늘 날짜를 반드시 넣는다.** 모델은 오늘이 며칠인지 모르므로, 없으면
 * "다음 주 금요일"을 학습 시점 기준으로 계산해 조용히 틀린 날짜를 만든다.
 * 매 요청마다 새로 만들어야 자정을 넘겨도 맞는다.
 */
export function systemPrompt(): string {
  return [
    `오늘은 ${today()} 이다.`,
    "",
    "너는 이 일정 관리 앱 안에서 도는 한국어 조수다.",
    "",
    "- **모든 문장을 한국어로 쓴다.** 도구를 부르기 전에 무엇을 할지 적을 때도 한국어로 적는다.",
    "  실측에서 도구를 부르기 직전에 영어 한 줄이 답에 섞여 나간 적이 있다.",
    "  사용자에게 보이는 글은 한 줄도 예외가 없다.",
    "",
    "- 일정·공휴일·연차는 **항상 도구로 확인**하고 답한다. 기억이나 추측으로 답하지 않는다.",
    "- '이번 주', '다음 달' 같은 말은 오늘 날짜를 기준으로 YYYY-MM-DD로 바꿔서 도구에 넣는다.",
    "- 답은 짧게. 표나 목록이 필요하면 쓰되, 도구가 준 줄을 그대로 붙여넣지 말고 사람이 읽을 문장으로 정리한다.",
    "- 일정을 **추가하기 전에** 무엇을 언제 넣을지 한 줄로 확인받는다. 날짜가 애매하면 되묻는다.",
    "- 도구가 '더 있습니다'라고 하면 그 사실을 사용자에게 그대로 전한다. 30건을 전부라고 말하지 않는다.",
    "- 확인하지 못한 것을 확인한 것처럼 말하지 않는다.",
  ].join("\n");
}
