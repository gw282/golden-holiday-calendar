import type { DateStr } from "./date";

/**
 * 양력 날짜 → 음력 일자 표시.
 *
 * `holidays.ts`도 같은 단기력(dangi)을 쓰지만 방향이 반대다 — 거긴 "음력 몇 월
 * 며칠"에서 양력 날짜를 역산하고, 여긴 양력 날짜를 dangi로 그대로 포맷해서
 * 음력 월·일을 바로 읽는다. 매일 있는 값이라 매년 계산해 둔 표가 필요 없다 —
 * 날짜 하나하나를 그때그때 포맷하면 끝난다.
 */
const dangi = new Intl.DateTimeFormat("en-u-ca-dangi", {
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

/** 초하루면 "(윤)M월 1일", 그 외엔 "D"만 — 달력 칸에 매일 월을 반복해 적을 이유가 없다 */
export function lunarLabel(date: DateStr): string {
  const parts = dangi.formatToParts(new Date(`${date}T00:00:00Z`));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const rawMonth = get("month");
  const day = get("day");
  const leap = rawMonth.endsWith("bis");
  const month = leap ? rawMonth.slice(0, -3) : rawMonth;
  return day === "1" ? `${leap ? "윤" : ""}${month}월 1일` : day;
}

/** [from, to] 구간 모든 날의 음력 일자 표시. 달력 그리드가 훑는 범위를 그대로 받는다 */
export function lunarInRange(from: DateStr, to: DateStr): Map<DateStr, string> {
  const map = new Map<DateStr, string>();
  for (let t = new Date(`${from}T00:00:00Z`); ; t = new Date(t.getTime() + 86400000)) {
    const date = t.toISOString().slice(0, 10) as DateStr;
    map.set(date, lunarLabel(date));
    if (date >= to) break;
  }
  return map;
}
