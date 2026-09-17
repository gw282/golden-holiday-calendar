import { addDays, dayOfWeek, isValidDateStr, today, type DateStr } from "./date";

/**
 * 자연어 퀵 입력 파서 — "내일 오후 3시 팀 회의" 같은 한 줄을 날짜·시각·제목으로 쪼갠다.
 *
 * **순수 로컬 로직이다.** 외부 API를 부르지 않는다 — 정규식과 `lib/date.ts`의 날짜
 * 계산만으로 끝난다. 그래서 오프라인에서도, 타이핑하는 즉시(디바운스 없이도) 바로 돈다.
 *
 * 날짜 → 시각 순서로 문자열에서 **찾아서 지운다.** 남는 글자가 제목이다 — 이 순서를
 * 반대로 하면(제목을 먼저 정하면) 날짜·시각 토큰이 제목에 섞여 들어간다.
 *
 * 완벽한 자연어 이해가 목표가 아니다. 못 알아들은 부분은 그냥 제목에 남는다 —
 * 예를 들어 "다다음주 금요일"은 "다음주"만 걸려 한 주 어긋난다. 이런 값은 사람이
 * 팝업에서 눈으로 보고 고치면 되므로, 파서가 조용히 틀린 값을 만드는 것보다
 * **아예 못 찾아서 오늘 날짜로 남는** 쪽이 낫다(무엇을 못 읽었는지 title에 그대로 보인다).
 */

export type QuickParseResult = {
  date: DateStr;
  /** 'HH:mm'. 시각을 못 찾았으면 null — 하루 종일 일정으로 둔다 */
  time: string | null;
  title: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

export function parseQuickInput(input: string, base: DateStr = today()): QuickParseResult {
  let rest = input;

  const dateHit = extractDate(rest, base);
  const date = dateHit?.value ?? base;
  if (dateHit) rest = rest.slice(0, dateHit.index) + rest.slice(dateHit.index + dateHit.length);

  const timeHit = extractTime(rest);
  const time = timeHit?.value ?? null;
  if (timeHit) rest = rest.slice(0, timeHit.index) + rest.slice(timeHit.index + timeHit.length);

  // 시각 뒤에 흔히 붙는 조사("에")나 남은 공백 찌꺼기를 정리한다
  const title = rest.replace(/^\s*에\s*/g, " ").replace(/\s+/g, " ").trim();

  return { date, time, title: title || input.trim() };
}

type Hit<T> = { value: T; index: number; length: number };

function extractDate(text: string, base: DateStr): Hit<DateStr> | null {
  // 순서가 뜻을 가른다 — "다음주 금요일"은 요일 패턴이 "다음주"까지 먹어야 하므로
  // 요일 패턴을 먼저 시도한다. 숫자 날짜(M/D, M월D일)는 상대 표현과 안 겹친다.
  const weekday = /(다음\s?주|이번\s?주)?\s*([일월화수목금토])요일/.exec(text);
  if (weekday) {
    const dow = WEEKDAY_INDEX[weekday[2]];
    const mode = weekday[1]?.replace(/\s/g, "") === "다음주" ? "next" : weekday[1] ? "this" : "upcoming";
    return { value: weekdayDate(base, dow, mode), index: weekday.index, length: weekday[0].length };
  }

  const slash = /(\d{1,2})[./](\d{1,2})/.exec(text);
  if (slash) {
    const value = resolveMonthDay(base, Number(slash[1]), Number(slash[2]));
    if (value) return { value, index: slash.index, length: slash[0].length };
  }

  const korean = /(\d{1,2})월\s*(\d{1,2})일/.exec(text);
  if (korean) {
    const value = resolveMonthDay(base, Number(korean[1]), Number(korean[2]));
    if (value) return { value, index: korean.index, length: korean[0].length };
  }

  const relative = /글피|모레|내일|오늘/.exec(text);
  if (relative) {
    const days =
      relative[0] === "글피" ? 3 : relative[0] === "모레" ? 2 : relative[0] === "내일" ? 1 : 0;
    return { value: addDays(base, days), index: relative.index, length: relative[0].length };
  }

  return null;
}

/** 'HH:mm' 또는 못 찾으면 null */
function extractTime(text: string): Hit<string> | null {
  // "반"은 30분을 뜻하지만 "반차"·"반반차"(휴가 종류)의 앞부분과 겹친다.
  // "10시 반차"에서 "반"까지 시각으로 먹어 버리면 반차가 "10시 반(10:30)"이
  // 돼 버리고 제목엔 "차"만 남는다 — 뒤에 "반"이나 "차"가 이어지면 시간의
  // "반"이 아니라 휴가 이름의 일부로 본다.
  const m = /(오전|오후)?\s*(\d{1,2})시\s*(반(?!반|차)|(\d{1,2})\s*분)?/.exec(text);
  if (!m) return null;

  let hour = Number(m[2]);
  if (hour > 23) return null; // "3000시" 같은 오탐 방지

  const meridiem = m[1];
  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;
  if (hour > 23) return null;

  const minute = m[3] === "반" ? 30 : m[4] ? Number(m[4]) : 0;
  if (minute > 59) return null;

  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { value, index: m.index, length: m[0].length };
}

/**
 * 이번 주/다음 주 안의 그 요일. 달력이 월요일 시작이라 월요일을 주의 첫 날로 본다
 * (일요일은 그 주의 마지막 날, +6).
 *
 * `upcoming`(요일만 쓰고 "이번주/다음주"가 없을 때)은 **오늘을 포함해 다음으로
 * 오는 그 요일**이다 — 오늘이 금요일이면 "금요일"은 오늘을 가리킨다.
 */
function weekdayDate(base: DateStr, targetDow: number, mode: "this" | "next" | "upcoming"): DateStr {
  if (mode === "upcoming") {
    const baseDow = dayOfWeek(base);
    const diff = (targetDow - baseDow + 7) % 7;
    return addDays(base, diff);
  }
  const baseDow = dayOfWeek(base);
  const mondayOffset = (baseDow + 6) % 7;
  const thisMonday = addDays(base, -mondayOffset);
  const weekStart = mode === "next" ? addDays(thisMonday, 7) : thisMonday;
  const offsetFromMonday = targetDow === 0 ? 6 : targetDow - 1;
  return addDays(weekStart, offsetFromMonday);
}

/** 올해 M/D. 이미 지난 날짜면 내년으로 — "12월에 1/5을 쳤다"처럼 연도가 넘어가는 경우를 다룬다 */
function resolveMonthDay(base: DateStr, month: number, day: number): DateStr | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(base.slice(0, 4));
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isValidDateStr(candidate)) return null;
  if (candidate < base) {
    const nextYear = `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isValidDateStr(nextYear) ? nextYear : candidate;
  }
  return candidate;
}
