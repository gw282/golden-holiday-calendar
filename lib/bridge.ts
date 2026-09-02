import { addDays, eachDay, type DateStr } from "./date";
import { holidayMap, isRestDay } from "./calendar";
import type { Holiday } from "./holidays";

/**
 * 징검다리 연휴 후보 만들기 — "연차를 어디에 끼워 넣으면 가장 야무진가".
 *
 * 1. 대상 기간의 모든 날을 쉬는 날(주말+공휴일) / 일하는 날로 표시
 * 2. 누적합으로 임의 구간의 평일(= 필요 연차) 개수를 O(1)에 구한다
 * 3. "더 이상 늘릴 수 없는 연휴 구간"을 모두 만든다.
 *    구간 [s..e]의 바로 앞뒤(s-1, e+1)가 연차로 쓰지 않는 평일이면 그 구간이 곧 연휴다.
 *    이 조건 하나로 구간이 유일하게 정해져서 중복 제거가 따로 필요 없다.
 * 4. 3일 이상이고 공휴일을 하나 이상 포함하며, 연차로 쓸 날이 비어 있는 것만 남긴다
 *
 * 양 끝을 쉬는 날로 못 박지 않는 이유: 금요일 공휴일 뒤에 월요일 연차를 붙이는
 * 가장 흔한 샌드위치 패턴은 구간의 끝이 연차라서, 양 끝 조건을 걸면 통째로 누락된다.
 *
 * 주말만 늘리는 경우(금요일 연차 → 3일)는 기본적으로 공휴일 조건에서 걸러진다.
 * 누구나 아는 값이라 추천으로서 정보량이 없고, 넣으면 효율 3.0으로 목록을 도배한다.
 *
 * 정렬과 추리기는 여기서 하지 않는다. 화면마다 기준이 달라 부르는 쪽이 정한다.
 */

/** 구간을 양옆으로 넓힐 때 창 밖 연휴까지 이어붙일 수 있도록 두는 여유 */
const PAD_DAYS = 21;
/** 이보다 짧으면 연휴라고 부르지 않는다 */
const MIN_STREAK_DAYS = 3;

/** "더 이상 늘릴 수 없는 연휴 구간" 하나 */
export type BridgeCandidate = {
  start: DateStr;
  end: DateStr;
  /** 실제로 써야 하는 연차 날짜들 */
  leaveDates: DateStr[];
  leaveCount: number;
  /** 구간 길이(일) */
  totalDays: number;
  /** totalDays / leaveCount — 연차 1일당 확보하는 휴일 수 */
  efficiency: number;
  /** 구간에 걸친 공휴일 (하루당 한 항목) */
  holidays: Holiday[];
};

export type CandidateOptions = {
  from: DateStr;
  to: DateStr;
  /** 한 연휴에 쓸 연차 하한. 기본 1 */
  minLeaves?: number;
  /** 한 연휴에 쓸 연차 상한. 기본 3 */
  maxLeaves?: number;
  /** 공휴일을 하나도 안 끼는 구간(순수 주말 연장)도 포함할지. 기본 false */
  includeHolidayFree?: boolean;
  /** 연휴 길이 하한(일). 기본 3 */
  minTotalDays?: number;
  /** 연휴 길이 상한(일). 기본 없음 */
  maxTotalDays?: number;
  /**
   * 연차를 쓸 수 없는 날 (이미 일정이 잡혀 있는 날).
   * 이 날을 **연차로 써야만** 성립하는 후보는 통째로 버린다.
   * 쉬는 날 쪽에 일정이 걸린 건 막지 않는다 — 그건 옮기면 그만이지만
   * 연차는 그 날 일이 있으면 애초에 못 낸다.
   */
  busyDates?: ReadonlySet<DateStr>;
};

/** 대상 기간의 모든 "연휴 후보"를 만든다. 정렬하지 않은 채로 돌려준다. */
export function collectCandidates(o: CandidateOptions): BridgeCandidate[] {
  const { from, to } = o;
  const maxLeaves = Math.max(1, Math.min(10, Math.trunc(o.maxLeaves ?? 3)));
  const minLeaves = Math.max(1, Math.min(maxLeaves, Math.trunc(o.minLeaves ?? 1)));
  const minTotalDays = Math.max(MIN_STREAK_DAYS, Math.trunc(o.minTotalDays ?? MIN_STREAK_DAYS));
  const maxTotalDays = o.maxTotalDays === undefined ? undefined : Math.trunc(o.maxTotalDays);

  if (to < from) return [];
  if (maxTotalDays !== undefined && maxTotalDays < minTotalDays) return [];

  // 1. 창을 앞뒤로 넓혀 두고 쉬는 날 여부를 표시한다.
  //    (창 경계에 걸친 연휴의 실제 길이를 놓치지 않기 위한 패딩)
  const winStart = addDays(from, -PAD_DAYS);
  const winEnd = addDays(to, PAD_DAYS);
  const holidays = holidayMap(winStart, winEnd);
  const days = eachDay(winStart, winEnd);
  const n = days.length;

  const rest = new Uint8Array(n);
  for (let i = 0; i < n; i++) rest[i] = isRestDay(days[i], holidays) ? 1 : 0;

  // 2. 누적합. workPrefix[i] = days[0..i-1] 중 일하는 날 수
  const workPrefix = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) workPrefix[i + 1] = workPrefix[i] + (rest[i] ? 0 : 1);
  /** 닫힌 구간 [i..j]의 일하는 날 수 = 그 구간을 통째로 쉬는 데 필요한 연차 수 */
  const leavesNeeded = (i: number, j: number) => workPrefix[j + 1] - workPrefix[i];

  /** 연휴가 여기서 끊긴다 = 연차로 쓰지 않는 평일이거나 창 밖 */
  const breaksStreak = (i: number) => i < 0 || i >= n || !rest[i];

  const out: BridgeCandidate[] = [];

  // 3~4. 시작점 s는 앞이 끊겨 있어야 하고, 끝점 e는 뒤가 끊겨 있어야 한다.
  for (let s = 0; s < n; s++) {
    if (!breaksStreak(s - 1)) continue; // 왼쪽으로 더 늘어나는 구간 — s에서 시작하지 않는다

    for (let e = s; e < n; e++) {
      const leaveCount = leavesNeeded(s, e);
      // 필요 연차는 e가 커질수록 단조 증가 → 상한을 넘으면 더 볼 것이 없다
      if (leaveCount > maxLeaves) break;
      if (!breaksStreak(e + 1)) continue; // 오른쪽으로 더 늘어난다

      const totalDays = e - s + 1;
      if (leaveCount < minLeaves) continue; // 0일이면 연차 없이 이미 쉬는 구간
      if (totalDays < minTotalDays) continue;
      if (maxTotalDays !== undefined && totalDays > maxTotalDays) break; // 길이도 단조 증가

      const leaveDates: DateStr[] = [];
      const spanHolidays: Holiday[] = [];
      for (let k = s; k <= e; k++) {
        if (!rest[k]) leaveDates.push(days[k]);
        const h = holidays.get(days[k]);
        if (h) spanHolidays.push(h);
      }

      if (spanHolidays.length === 0 && !o.includeHolidayFree) continue;
      // 패딩 구간(과거이거나 조회 범위 밖)의 연차는 추천하지 않는다
      if (leaveDates[0] < from || leaveDates[leaveDates.length - 1] > to) continue;
      // 이미 일정이 잡힌 날은 연차를 낼 수 없다
      if (o.busyDates && leaveDates.some((d) => o.busyDates!.has(d))) continue;

      out.push({
        start: days[s],
        end: days[e],
        leaveDates,
        leaveCount,
        totalDays,
        efficiency: totalDays / leaveCount,
        holidays: spanHolidays,
      });
    }
  }

  return out;
}
