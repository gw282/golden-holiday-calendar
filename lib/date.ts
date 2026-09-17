/**
 * 날짜는 앱 전체에서 'YYYY-MM-DD' 문자열로만 다룬다.
 * Date 객체는 계산이 필요한 순간에만 UTC 기준으로 만들어 쓰고 바로 문자열로 되돌린다.
 */
export type DateStr = string;

const DAY_MS = 86_400_000;

export function toDateStr(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' -> UTC 자정 Date */
export function parseDate(s: DateStr): Date {
  return new Date(s + "T00:00:00Z");
}

export function addDays(s: DateStr, n: number): DateStr {
  return toDateStr(new Date(parseDate(s).getTime() + n * DAY_MS));
}

export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}

/** 0=일 … 6=토 */
export function dayOfWeek(s: DateStr): number {
  return parseDate(s).getUTCDay();
}

export function isWeekend(s: DateStr): boolean {
  const d = dayOfWeek(s);
  return d === 0 || d === 6;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayKo(s: DateStr): string {
  return WEEKDAY_KO[dayOfWeek(s)];
}

/** '9월 25일(금)' */
export function formatKo(s: DateStr): string {
  const d = parseDate(s);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${weekdayKo(s)})`;
}

/** 서버의 로컬 기준 오늘 (KST 서버라면 KST 오늘) */
export function today(): DateStr {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return toDateStr(local);
}

/**
 * 다룰 수 있는 연도 범위.
 *
 * `0000`이나 `9999` 근처를 받으면 `Date`가 **확장연도 표기**(`-000001-12-31`,
 * `+010000-01-01`)를 내놓는다. 그걸 `slice(0, 10)`한 문자열은 더 이상 날짜가 아니어서
 * `addDays`가 `Invalid time value`를 던지거나, 문자열 비교가 뒤집혀
 * `buildMonth`의 `while (cursor <= gridEnd)`가 **끝나지 않는다** —
 * 실제로 `/?month=0000-01` 하나로 서버 전체가 멈췄다.
 *
 * 형식만 보고 값을 안 보면 이런 일이 생긴다. 여기서 막는다.
 */
const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

function yearInRange(s: string): boolean {
  const y = Number(s.slice(0, 4));
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

export function isValidDateStr(s: unknown): s is DateStr {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  if (!yearInRange(s)) return false;

  const d = parseDate(s);
  if (Number.isNaN(d.getTime())) return false;

  // 없는 날짜는 Date가 조용히 넘긴다 (2026-02-30 → 2026-03-02).
  // 형식 검사만으로는 통과해 버리므로, 다시 문자열로 찍어 같은 날인지 확인한다.
  return toDateStr(d) === s;
}

/** [from, to] 사이의 모든 날짜 */
export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ── 월(月) 단위 유틸 — 달력 화면용 ───────────────────────────────── */

/** 'YYYY-MM' */
export type MonthStr = string;

export function isValidMonthStr(s: unknown): s is MonthStr {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) && yearInRange(s);
}

/** '2026-09-25' -> '2026-09' */
export function monthOf(s: DateStr): MonthStr {
  return s.slice(0, 7);
}

export function monthStart(m: MonthStr): DateStr {
  return `${m}-01`;
}

/** 다음 달 0일 = 이번 달 말일 */
export function monthEnd(m: MonthStr): DateStr {
  const [y, mo] = m.split("-").map(Number);
  return toDateStr(new Date(Date.UTC(y, mo, 0)));
}

export function addMonths(m: MonthStr, n: number): MonthStr {
  const [y, mo] = m.split("-").map(Number);
  return toDateStr(new Date(Date.UTC(y, mo - 1 + n, 1))).slice(0, 7);
}

/** 달력이 한 주를 어느 요일부터 그릴지 — 설정에서 고를 수 있다 (기본 월요일) */
export type WeekStart = "mon" | "sun";

/**
 * 그 날이 속한 주의 시작일. 기본은 **월요일**(달력을 그렇게 그리기 때문)이고,
 * dayOfWeek는 0=일이라 월요일을 0으로 옮겨 계산한다. `weekStart`가 "sun"이면
 * 그대로 dayOfWeek만큼 빼면 일요일이 나온다.
 */
export function startOfWeek(s: DateStr, weekStart: WeekStart = "mon"): DateStr {
  const offset = weekStart === "sun" ? dayOfWeek(s) : (dayOfWeek(s) + 6) % 7;
  return addDays(s, -offset);
}

/** '2026년 9월' */
export function formatMonthKo(m: MonthStr): string {
  const [y, mo] = m.split("-").map(Number);
  return `${y}년 ${mo}월`;
}


/** '9/25(금)' — 좁은 자리에 쓰는 짧은 표기 */
export function formatShortKo(s: DateStr): string {
  const d = parseDate(s);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${weekdayKo(s)})`;
}

/**
 * 며칠에 걸친 일정의 날짜 표기 — 업무 보고용 복사(CopyDayButton)에 쓴다.
 * 하루짜리는 '9월 25일', 같은 달 안이면 '9월 25일~27일', 달이 바뀌면
 * '9월 30일~10월 2일'처럼 끝 날짜에도 달을 다시 적는다 — 달을 안 적으면
 * "30일~2일"만 보고는 어느 쪽이 먼저인지, 심지어 몇 달인지도 알 수 없다.
 */
export function formatRangeKo(from: DateStr, to: DateStr): string {
  const a = parseDate(from);
  const b = parseDate(to);
  const am = a.getUTCMonth() + 1;
  const ad = a.getUTCDate();
  const bm = b.getUTCMonth() + 1;
  const bd = b.getUTCDate();

  if (from === to) return `${am}월 ${ad}일`;
  if (am === bm) return `${am}월 ${ad}일~${bd}일`;
  return `${am}월 ${ad}일~${bm}월 ${bd}일`;
}


/* ── 시각(HH:MM) 유틸 — 겹침 검사용 ───────────────────────────────── */

/**
 * ISO-8601 주차. 그 주의 목요일이 속한 연도 기준으로 센다 — 12월 말/1월 초 주가
 * 어느 해 1주차인지가 이 규칙으로 정해진다. 달력이 이미 월요일 시작이라 그대로 맞는다.
 */
export function isoWeekNumber(s: DateStr): number {
  const d = parseDate(s);
  const dayIdx = (d.getUTCDay() + 6) % 7; // 0=월 … 6=일
  const thursday = new Date(d.getTime() + (3 - dayIdx) * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil((Math.round((thursday.getTime() - yearStart) / DAY_MS) + 1) / 7);
}

/** 'HH:MM' -> 자정부터의 분. 형식이 아니면 null (검증은 lib/events.ts가 이미 한다) */
export function minutesOf(hhmm: string | null | undefined): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
