import { addDays, addMonths, isWeekend, monthOf, type DateStr, type MonthStr } from "./date";

/**
 * 사내 고정 마일스톤 — DB가 아니라 여기 소스에 직접 적어 둔다.
 * `lib/holidays.ts`의 MANUAL_HOLIDAYS와 같은 이유다: 회사마다 다르고
 * 사내 시스템 연동이 없어 규칙으로 만들 수 없다. 표시 전용이라
 * `busyDates`/연차 계산/`bridge.ts`에는 관여하지 않는다.
 */
export type Milestone = { title: string; color: string };

/**
 * 매월 20일 급여일. 그 날이 쉬는 날(주말·공휴일)이면 **앞쪽으로** 당긴다
 * (예: 20일이 일요일이면 18일 금요일). 날짜가 바뀌면 이 한 줄만 고치면 된다.
 */
const PAYDAY_DAY = 20;
const PAYDAY_COLOR = "#3E8B5C";

/** 손으로 관리하는 일회성 마일스톤 (창립기념일·분기 마감·노조 휴무일 등) */
const COMPANY_MILESTONES: Record<DateStr, Milestone> = {
  "2026-03-02": { title: "창립기념일", color: "#7C5CBF" },
  "2026-03-31": { title: "1분기 마감", color: "#B15A2E" },
  "2026-06-30": { title: "2분기 마감", color: "#B15A2E" },
  "2026-09-30": { title: "3분기 마감", color: "#B15A2E" },
  "2026-12-31": { title: "4분기 마감", color: "#B15A2E" },
};

/** 쉬는 날이 아닐 때까지 하루씩 앞으로 당긴다 */
function moveToWorkdayBefore(date: DateStr, holidayDates: ReadonlySet<DateStr>): DateStr {
  let d = date;
  while (isWeekend(d) || holidayDates.has(d)) d = addDays(d, -1);
  return d;
}

/**
 * [from, to] 구간에 걸리는 마일스톤. 달력 그리드가 월 경계를 넘어가므로 범위로 받는다.
 * `holidayDates`는 급여일이 쉬는 날일 때 앞으로 당기는 데만 쓴다 — `calendar.ts`가
 * 이미 그리드 범위로 구해 둔 공휴일 Map을 그대로 넘기면 된다(여긴 DB를 직접 보지 않는다).
 */
export function milestonesInRange(
  from: DateStr,
  to: DateStr,
  holidayDates: ReadonlySet<DateStr>,
): Map<DateStr, Milestone> {
  const map = new Map<DateStr, Milestone>();

  for (const [date, milestone] of Object.entries(COMPANY_MILESTONES)) {
    if (date >= from && date <= to) map.set(date, milestone);
  }

  // 급여일이 당겨지면서 달 경계를 넘어 이 구간 밖으로 나갈 수도 있으니
  // 앞뒤로 한 달씩 더 넉넉히 훑는다.
  let cursor: MonthStr = addMonths(monthOf(from), -1);
  const lastMonth = addMonths(monthOf(to), 1);
  while (cursor <= lastMonth) {
    const scheduled = `${cursor}-${String(PAYDAY_DAY).padStart(2, "0")}`;
    const payday = moveToWorkdayBefore(scheduled, holidayDates);
    if (payday >= from && payday <= to && !map.has(payday)) {
      map.set(payday, { title: "급여일", color: PAYDAY_COLOR });
    }
    cursor = addMonths(cursor, 1);
  }

  return map;
}
