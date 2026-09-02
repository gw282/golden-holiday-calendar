import { getDb } from "./db";
import { isMultiDay, listEventsBetween, type Event } from "./events";
import type { Holiday } from "./holidays";
import {
  addDays,
  addMonths,
  dayOfWeek,
  isWeekend,
  monthEnd,
  monthStart,
  startOfWeek,
  today,
  type DateStr,
  type MonthStr,
} from "./date";

/**
 * 달력 도메인.
 *
 * 공휴일 원본은 `lib/holidays.ts`(시드 데이터)에 있고, 조회는 항상 DB를 거친다.
 * `lib/db.ts`가 holidays.ts를 import하므로 조회 함수를 holidays.ts에 두면
 * 순환 참조가 되기 때문에 이 파일에 모아 둔다. `lib/bridge.ts`도 여기서 가져다 쓴다.
 */
/**
 * `node:sqlite`가 주는 행은 **프로토타입이 null인 객체**다. 그대로 Server Component에서
 * Client Component로 넘기면 "Only plain objects ... can be passed"로 500이 난다.
 * 그래서 여기서 평범한 객체 리터럴로 바꿔 담는다 (`lib/events.ts`의 toEvent와 같은 이유).
 */
type HolidayRow = { date: DateStr; name: string; kind: Holiday["kind"] };

export function listHolidays(from: DateStr, to: DateStr): Holiday[] {
  const rows = getDb()
    .prepare(`SELECT date, name, kind FROM holidays WHERE date BETWEEN ? AND ? ORDER BY date`)
    .all(from, to) as unknown as HolidayRow[];
  return rows.map((r) => ({ date: r.date, name: r.name, kind: r.kind }));
}

export function holidayMap(from: DateStr, to: DateStr): Map<DateStr, Holiday> {
  return new Map(listHolidays(from, to).map((h) => [h.date, h]));
}

/** 쉬는 날 = 주말 또는 공휴일 */
export function isRestDay(date: DateStr, holidays: Map<DateStr, Holiday>): boolean {
  return isWeekend(date) || holidays.has(date);
}

export type CalendarDay = {
  date: DateStr;
  dayOfMonth: number;
  /** 그리드를 채우기 위해 끌어온 앞뒤 달의 날짜인지 */
  inMonth: boolean;
  isToday: boolean;
  /** 0=일 … 6=토 */
  weekday: number;
  holiday: Holiday | null;
  events: Event[];
};

export type CalendarMonth = {
  month: MonthStr;
  prevMonth: MonthStr;
  nextMonth: MonthStr;
  /** 일요일 시작, 7일씩 4~6줄 */
  weeks: CalendarDay[][];
  /**
   * 여러 날에 걸친 일정. 칸마다 같은 제목을 반복해 넣지 않고 가로 띠로 그린다.
   * 하루짜리는 `CalendarDay.events`에 들어간다.
   */
  spanning: Event[];
};

/** 한 달 그리드를 만든다. 일정·공휴일을 그리드 전체 범위로 한 번에 읽는다. */
export function buildMonth(month: MonthStr): CalendarMonth {
  const first = monthStart(month);
  const last = monthEnd(month);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);

  const holidays = holidayMap(gridStart, gridEnd);

  const byDate = new Map<DateStr, Event[]>();
  const spanning: Event[] = [];

  for (const e of listEventsBetween(gridStart, gridEnd)) {
    if (isMultiDay(e)) {
      spanning.push(e);
      continue;
    }
    const bucket = byDate.get(e.date);
    if (bucket) bucket.push(e);
    else byDate.set(e.date, [e]);
  }

  const t = today();
  const weeks: CalendarDay[][] = [];
  let cursor = gridStart;

  while (cursor <= gridEnd) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        date: cursor,
        dayOfMonth: Number(cursor.slice(8, 10)),
        inMonth: cursor >= first && cursor <= last,
        isToday: cursor === t,
        weekday: dayOfWeek(cursor),
        holiday: holidays.get(cursor) ?? null,
        events: byDate.get(cursor) ?? [],
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  return {
    month,
    prevMonth: addMonths(month, -1),
    nextMonth: addMonths(month, 1),
    weeks,
    spanning,
  };
}

/**
 * 시드된 공휴일 데이터가 실제로 덮는 범위.
 * 추천 기간을 여기까지로 잘라 두면, 데이터가 없는 해를 "공휴일이 하나도 없는 해"로
 * 착각해 훑는 낭비와 오해를 막을 수 있다.
 */
export function holidayCoverage(): { from: DateStr; to: DateStr } | null {
  const row = getDb()
    .prepare(`SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM holidays`)
    .get() as unknown as { min_date: string | null; max_date: string | null } | undefined;

  return row?.min_date && row?.max_date ? { from: row.min_date, to: row.max_date } : null;
}

/** 그 날의 공휴일. 일정 목록에도 공휴일을 같이 보여 주려고 쓴다. */
export function getHoliday(date: DateStr): Holiday | null {
  const row = getDb()
    .prepare(`SELECT date, name, kind FROM holidays WHERE date = ?`)
    .get(date) as unknown as Holiday | undefined;
  return row ?? null;
}

/**
 * 기준일 앞뒤로 가장 가까운 공휴일. 달을 하나씩 넘기며 찾을 필요 없이 바로 건너뛰라고 쓴다.
 * 기준일 자신은 제외한다 (같은 날에 머무르면 이동이 아니다).
 */
export function adjacentHoliday(date: DateStr, direction: "prev" | "next"): Holiday | null {
  const sql =
    direction === "next"
      ? `SELECT date, name, kind FROM holidays WHERE date > ? ORDER BY date ASC LIMIT 1`
      : `SELECT date, name, kind FROM holidays WHERE date < ? ORDER BY date DESC LIMIT 1`;

  const row = getDb().prepare(sql).get(date) as unknown as Holiday | undefined;
  return row ?? null;
}
