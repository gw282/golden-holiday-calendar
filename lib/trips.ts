import { eachDay, type DateStr } from "./date";
import { holidayMap, isRestDay } from "./calendar";
import type { Holiday } from "./holidays";

/**
 * 원하는 여행 길이로 거꾸로 찾기 — "3박 4일 가려는데 연차를 가장 적게 쓰는 시기가 언제인가".
 *
 * `lib/bridge.ts`와 방향이 반대다. bridge는 **주어진 날**을 끼고 늘릴 수 있는 만큼 늘린
 * 연휴를 만든다(길이는 결과). 여기서는 **길이가 입력**이고 시기가 결과다.
 *
 * 그래서 bridge의 "더 이상 늘릴 수 없는 구간" 조건을 쓸 수 없다. 길이 L을 고정한 채
 * 하루씩 밀며 그 안의 평일 수(= 필요 연차)를 재는 고정폭 슬라이딩 윈도가 맞는 계산이다.
 *
 * 공휴일을 하나 이상 끼라는 조건은 걸지 않는다. bridge에서는 그 조건이 없으면
 * "금요일에 연차 쓰면 3일"이 목록을 도배했지만, 여기서는 길이가 이미 정해져 있어
 * 결과 수가 폭발하지 않고 연차 수로 정렬하면 좋은 것이 위로 올라온다.
 * 실제로 연휴가 없는 시기에 3박 4일을 가려면 연차 2일이 맞는 답이다.
 */

/** 화면에 내놓는 길이 선택지. days는 총 일수(2박 3일 → 3) */
export const TRIP_LENGTHS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 3, label: "2박 3일" },
  { days: 4, label: "3박 4일" },
  { days: 5, label: "4박 5일" },
  { days: 7, label: "일주일" },
];

/** 길이마다 기본으로 몇 개까지 내놓을지 */
const DEFAULT_LIMIT = 6;

export type Trip = {
  start: DateStr;
  end: DateStr;
  /** 총 일수 */
  days: number;
  /** 이 구간을 통째로 쉬려면 내야 하는 연차 날짜들 */
  leaveDates: DateStr[];
  leaveCount: number;
  /** 구간에 걸친 공휴일 */
  holidays: Holiday[];
};

export type TripOptions = {
  from: DateStr;
  to: DateStr;
  /** 여행 총 일수 */
  days: number;
  /** 이미 일정이 잡혀 연차를 낼 수 없는 날 — 그 날을 연차로 써야 하는 구간은 버린다 */
  busyDates?: ReadonlySet<DateStr>;
  limit?: number;
};

/**
 * 연차를 적게 쓰는 순으로 여행 구간을 찾는다.
 *
 * 겹치는 구간은 하나만 남긴다. 하루씩 밀린 창은 필요 연차가 똑같기 마련이라
 * (10/3~10/6과 10/4~10/7이 둘 다 연차 1일) 그대로 내놓으면 같은 연휴가 몇 줄씩 나온다.
 * 좋은 것부터 집고 겹치는 것을 버리는 그리디면 서로 다른 시기만 남는다.
 */
export function findTrips(o: TripOptions): Trip[] {
  const days = Math.trunc(o.days);
  const limit = Math.max(1, Math.trunc(o.limit ?? DEFAULT_LIMIT));
  if (days < 1 || o.to < o.from) return [];

  const all = eachDay(o.from, o.to);
  const n = all.length;
  if (n < days) return [];

  const holidays = holidayMap(o.from, o.to);
  const rest = new Uint8Array(n);
  for (let i = 0; i < n; i++) rest[i] = isRestDay(all[i], holidays) ? 1 : 0;

  // workPrefix[i] = all[0..i-1] 중 일하는 날 수
  const workPrefix = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) workPrefix[i + 1] = workPrefix[i] + (rest[i] ? 0 : 1);

  const windows: Trip[] = [];
  for (let s = 0; s + days - 1 < n; s++) {
    const e = s + days - 1;
    const leaveCount = workPrefix[e + 1] - workPrefix[s];

    const leaveDates: DateStr[] = [];
    const spanHolidays: Holiday[] = [];
    for (let k = s; k <= e; k++) {
      if (!rest[k]) leaveDates.push(all[k]);
      const h = holidays.get(all[k]);
      if (h) spanHolidays.push(h);
    }

    if (o.busyDates && leaveDates.some((d) => o.busyDates!.has(d))) continue;

    windows.push({
      start: all[s],
      end: all[e],
      days,
      leaveDates,
      leaveCount,
      holidays: spanHolidays,
    });
  }

  // 연차 적은 순 → 같은 연차면 이른 순. 정렬 기준이 화면과 하나뿐이라 여기서 정한다
  // (bridge와 달리 이 함수는 "가장 야무진 시기"라는 질문 자체가 정렬을 포함한다).
  windows.sort((a, b) => a.leaveCount - b.leaveCount || (a.start < b.start ? -1 : 1));

  const picked: Trip[] = [];
  for (const w of windows) {
    if (picked.length >= limit) break;
    if (picked.some((p) => w.start <= p.end && p.start <= w.end)) continue;
    picked.push(w);
  }

  // 고른 뒤에는 날짜 순으로 보여 준다. 연차 수는 줄마다 적혀 있고,
  // 목록을 훑는 사람이 실제로 찾는 것은 "언제"라서 시간 순이 읽기 쉽다.
  return picked.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/**
 * 보고 있는 해에서 여행을 찾을 구간.
 *
 * 지난 날짜는 자른다 — 이미 지나간 연휴를 추천해도 쓸 데가 없다.
 * 그 해가 통째로 과거면 `from > to`가 되어 `findTrips`가 빈 배열을 준다.
 */
export function tripRangeForYear(year: number, today: DateStr): { from: DateStr; to: DateStr } {
  const first = `${year}-01-01`;
  return { from: today > first ? today : first, to: `${year}-12-31` };
}
