/**
 * 대한민국 공휴일 — 규칙으로 생성한다.
 *
 * 예전에는 2026~2027년을 손으로 적어 뒀는데, 5년치로 늘리면서 규칙 기반으로 바꿨다.
 * 음력 공휴일(설날·추석·부처님오신날)은 Node의 ICU에 들어 있는 **단기(dangi) 력**을
 * `Intl.DateTimeFormat('en-u-ca-dangi')`로 읽어 양력 날짜를 역산한다.
 * 외부 API도, 음력 변환 표를 손으로 박아 넣는 일도 필요 없다.
 *
 * 대체공휴일은 「관공서의 공휴일에 관한 규정」 제3조를 코드로 옮긴 것이다.
 *  - 대상 제외: 신정, 현충일
 *  - 삼일절·광복절·개천절·한글날·부처님오신날·성탄절: 토요일 또는 일요일과 겹치면
 *  - 어린이날: 토요일·일요일 또는 다른 공휴일과 겹치면
 *  - 설날·추석 연휴: 연휴 중 일요일 또는 다른 공휴일과 겹치는 날 수만큼
 *    (토요일은 공휴일이 아니라서 설날·추석 연휴의 대체 사유가 되지 않는다)
 *
 * ⚠️ 규칙으로 만들 수 없는 것:
 *   선거일과 임시공휴일은 그때그때 지정되므로 예측이 불가능하다.
 *   확정되는 대로 아래 MANUAL_HOLIDAYS에 손으로 추가할 것.
 */
export type HolidayKind = "public" | "substitute";

export type Holiday = {
  date: string; // 'YYYY-MM-DD'
  name: string;
  kind: HolidayKind;
};

/** 규칙으로 생성할 수 없어 손으로 관리하는 공휴일 (선거일·임시공휴일) */
export const MANUAL_HOLIDAYS: Holiday[] = [
  { date: "2026-06-03", name: "제9회 전국동시지방선거일", kind: "public" },
];

const DAY_MS = 86_400_000;

/** 대체공휴일 부여 규칙 */
type SubstituteRule =
  /** 대체공휴일 없음 (신정·현충일) */
  | "none"
  /** 토·일과 겹치면 */
  | "weekend"
  /** 토·일 또는 다른 공휴일과 겹치면 (어린이날) */
  | "weekend-or-holiday";

type FixedHoliday = { month: number; day: number; name: string; rule: SubstituteRule };

/** 양력 고정 공휴일 */
const FIXED: FixedHoliday[] = [
  { month: 1, day: 1, name: "신정", rule: "none" },
  { month: 3, day: 1, name: "삼일절", rule: "weekend" },
  // 2026년부터 관공서 공휴일. 「근로자의 날 제정에 관한 법률」이 「노동절 …」로 바뀌면서
  // 관공서의 공휴일에 관한 규정 제2조에 신설됐다 (대체공휴일 대상).
  { month: 5, day: 1, name: "노동절", rule: "weekend-or-holiday" },
  { month: 5, day: 5, name: "어린이날", rule: "weekend-or-holiday" },
  { month: 6, day: 6, name: "현충일", rule: "none" },
  // 2008년에 빠졌다가 **2026년부터 다시** 공휴일이 됐다.
  // 제2조가 「국경일에 관한 법률」 포괄 규정으로 바뀌면서 국경일이 전부 들어왔다.
  { month: 7, day: 17, name: "제헌절", rule: "weekend-or-holiday" },
  { month: 8, day: 15, name: "광복절", rule: "weekend" },
  { month: 10, day: 3, name: "개천절", rule: "weekend" },
  { month: 10, day: 9, name: "한글날", rule: "weekend" },
  { month: 12, day: 25, name: "성탄절", rule: "weekend" },
];

const dangi = new Intl.DateTimeFormat("en-u-ca-dangi", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

function toStr(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/**
 * 음력 '연-월-일' → 양력 날짜 표. 필요한 범위를 하루씩 훑어 한 번에 만든다.
 * 윤달은 ICU가 month를 '4bis'처럼 내주므로 평달 키와 자연히 갈린다.
 */
function lunarToSolar(fromYear: number, toYear: number): Map<string, string> {
  const map = new Map<string, string>();
  // 설날이 양력 1~2월이라 전년 10월부터, 추석 여유로 다음 해 3월까지 훑는다
  const end = Date.UTC(toYear + 1, 2, 1);

  for (let t = Date.UTC(fromYear - 1, 9, 1); t <= end; t += DAY_MS) {
    const parts = dangi.formatToParts(new Date(t));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const key = `${get("relatedYear")}-${get("month")}-${get("day")}`;
    if (!map.has(key)) map.set(key, toStr(t));
  }

  return map;
}

/**
 * [fromYear, toYear] 사이의 공휴일 전체.
 * 대체공휴일까지 확정해서 날짜 순으로 돌려준다.
 */
export function buildHolidays(fromYear: number, toYear: number): Holiday[] {
  const lunar = lunarToSolar(fromYear, toYear);

  /** 확정된 공휴일. 대체공휴일을 놓을 자리를 찾을 때도 이 표를 본다. */
  const holidays = new Map<string, Holiday>();
  const put = (h: Holiday) => {
    if (!holidays.has(h.date)) holidays.set(h.date, h);
  };

  /** 대체공휴일이 필요한 건들 — 본 공휴일을 모두 넣은 뒤 날짜 순으로 처리한다 */
  const pending: Array<{ name: string; days: string[]; rule: SubstituteRule | "seollal-chuseok" }> =
    [];

  for (let y = fromYear; y <= toYear; y++) {
    for (const f of FIXED) {
      const date = toStr(Date.UTC(y, f.month - 1, f.day));
      put({ date, name: f.name, kind: "public" });
      if (f.rule !== "none") pending.push({ name: f.name, days: [date], rule: f.rule });
    }

    // 부처님오신날 — 음력 4월 8일
    const buddha = lunar.get(`${y}-4-8`);
    if (buddha) {
      put({ date: buddha, name: "부처님오신날", kind: "public" });
      pending.push({ name: "부처님오신날", days: [buddha], rule: "weekend" });
    }

    // 설날 · 추석 — 음력 1월 1일 / 8월 15일과 그 앞뒤 하루씩
    for (const [key, label] of [
      [`${y}-1-1`, "설날"],
      [`${y}-8-15`, "추석"],
    ] as const) {
      const mid = lunar.get(key);
      if (!mid) continue;

      const t = Date.UTC(+mid.slice(0, 4), +mid.slice(5, 7) - 1, +mid.slice(8, 10));
      const days = [toStr(t - DAY_MS), mid, toStr(t + DAY_MS)];

      put({ date: days[0], name: `${label} 연휴`, kind: "public" });
      put({ date: days[1], name: label, kind: "public" });
      put({ date: days[2], name: `${label} 연휴`, kind: "public" });

      pending.push({ name: label, days, rule: "seollal-chuseok" });
    }
  }

  for (const h of MANUAL_HOLIDAYS) {
    const y = +h.date.slice(0, 4);
    if (y >= fromYear && y <= toYear) put(h);
  }

  // 대체공휴일. 앞선 대체공휴일이 자리를 차지할 수 있으므로 날짜 순으로 처리한다.
  pending.sort((a, b) => (a.days[0] < b.days[0] ? -1 : 1));

  for (const p of pending) {
    let needed = 0;

    if (p.rule === "seollal-chuseok") {
      // 토요일은 공휴일이 아니라서 설날·추석 연휴의 대체 사유가 되지 않는다.
      // 일요일과 겹치거나, 그 자리를 다른 공휴일(예: 2028년 추석 연휴 속 개천절)이
      // 이미 차지한 날의 수만큼 대체공휴일이 붙는다.
      const own = new Set([p.name, `${p.name} 연휴`]);
      needed = p.days.filter(
        (d) => dayOfWeek(d) === 0 || !own.has(holidays.get(d)?.name ?? "")
      ).length;
    } else {
      const d = p.days[0];
      const w = dayOfWeek(d);
      const onWeekend = w === 0 || w === 6;
      const overlapsOther = holidays.get(d)?.name !== p.name;
      needed =
        p.rule === "weekend-or-holiday" ? (onWeekend || overlapsOther ? 1 : 0) : onWeekend ? 1 : 0;
    }

    // 연휴 마지막 날 다음부터, 일요일도 아니고 이미 공휴일도 아닌 날에 차례로 놓는다
    let cursor = Date.UTC(
      +p.days[p.days.length - 1].slice(0, 4),
      +p.days[p.days.length - 1].slice(5, 7) - 1,
      +p.days[p.days.length - 1].slice(8, 10)
    );

    for (let i = 0; i < needed; i++) {
      do {
        cursor += DAY_MS;
      } while (dayOfWeek(toStr(cursor)) === 0 || holidays.has(toStr(cursor)));

      put({ date: toStr(cursor), name: `${p.name} 대체공휴일`, kind: "substitute" });
    }
  }

  return [...holidays.values()]
    .filter((h) => {
      const y = +h.date.slice(0, 4);
      return y >= fromYear && y <= toYear;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
