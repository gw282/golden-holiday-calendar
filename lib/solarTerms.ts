import type { DateStr } from "./date";

/**
 * 24절기 — 태양의 황경(ecliptic longitude)이 15도씩 꺾이는 순간을 계산한다.
 *
 * 음력(설날·추석)과 달리 절기는 **태양 기준**이라 ICU 단기력(`holidays.ts`가 쓰는
 * 'en-u-ca-dangi')에 없다. 대신 태양 위치를 직접 계산한다 — Meeus의 저정밀도
 * 공식(오차 각초 단위)으로, 날짜 하나 맞히는 데는 차고 넘치는 정밀도다.
 * `holidays.ts`가 규칙으로 공휴일을 만들듯, 이것도 하드코딩 날짜표가 아니라
 * 매년 다시 계산한다.
 */

type Term = { name: string; longitude: number; month: number; day: number };

/**
 * 이름 · 목표 황경(춘분=0°, 15°씩 증가) · 뉴턴법 초기 추정값(월/일).
 * 초기값은 매년 하루 안팎만 흔들리는 절기 특성상 실제 값에 아주 가깝다 —
 * 뉴턴법이 몇 걸음 안에 수렴하려고 넣어 두는 것뿐, 이 날짜 자체가 답은 아니다.
 */
const TERMS: Term[] = [
  { name: "소한", longitude: 285, month: 1, day: 5 },
  { name: "대한", longitude: 300, month: 1, day: 20 },
  { name: "입춘", longitude: 315, month: 2, day: 4 },
  { name: "우수", longitude: 330, month: 2, day: 19 },
  { name: "경칩", longitude: 345, month: 3, day: 5 },
  { name: "춘분", longitude: 0, month: 3, day: 20 },
  { name: "청명", longitude: 15, month: 4, day: 5 },
  { name: "곡우", longitude: 30, month: 4, day: 20 },
  { name: "입하", longitude: 45, month: 5, day: 5 },
  { name: "소만", longitude: 60, month: 5, day: 21 },
  { name: "망종", longitude: 75, month: 6, day: 5 },
  { name: "하지", longitude: 90, month: 6, day: 21 },
  { name: "소서", longitude: 105, month: 7, day: 7 },
  { name: "대서", longitude: 120, month: 7, day: 22 },
  { name: "입추", longitude: 135, month: 8, day: 7 },
  { name: "처서", longitude: 150, month: 8, day: 23 },
  { name: "백로", longitude: 165, month: 9, day: 7 },
  { name: "추분", longitude: 180, month: 9, day: 23 },
  { name: "한로", longitude: 195, month: 10, day: 8 },
  { name: "상강", longitude: 210, month: 10, day: 23 },
  { name: "입동", longitude: 225, month: 11, day: 7 },
  { name: "소설", longitude: 240, month: 11, day: 22 },
  { name: "대설", longitude: 255, month: 12, day: 7 },
  { name: "동지", longitude: 270, month: 12, day: 22 },
];

/** 그레고리력 → 율리우스 적일(Julian Day, UT). hourUT는 뉴턴법 시작점일 뿐 결과 정밀도와 무관하다 */
function toJulianDay(year: number, month: number, day: number, hourUT = 3): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5 +
    hourUT / 24
  );
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** from - to를 (-180, 180] 범위로 접은 부호 있는 각도 차 */
function angleDiff(from: number, to: number): number {
  const d = normalizeDeg(from - to);
  return d > 180 ? d - 360 : d;
}

/**
 * 태양의 겉보기 지심 황경(도) — Meeus 저정밀도 공식. 세차·장동(Ω) 보정까지 포함해
 * 오차 0.01도 안팎이다. 절기는 하루 단위로만 맞히면 되니 남는 정밀도다.
 */
function apparentSolarLongitude(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  const l0 = normalizeDeg(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
  const m = normalizeDeg(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
  const mRad = (m * Math.PI) / 180;
  const c =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(mRad) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * mRad) +
    0.000289 * Math.sin(3 * mRad);
  const trueLongitude = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const apparent = trueLongitude - 0.00569 - 0.00478 * Math.sin((omega * Math.PI) / 180);
  return normalizeDeg(apparent);
}

/** 태양 황경은 하루에 대략 이만큼(도) 움직인다 — 뉴턴법 보정 폭을 잡는 데 쓴다 */
const DEG_PER_DAY = 360 / 365.2422;

const KST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Julian Day(UT) → 'YYYY-MM-DD', 한국 표준시 기준 날짜로 */
function jdToKstDateStr(jd: number): DateStr {
  const ms = (jd - 2440587.5) * 86400000; // 2440587.5 = 1970-01-01T00:00:00Z
  return KST_FORMAT.format(new Date(ms));
}

/** 그 해의 24절기. 초기 추정에서 뉴턴법으로 몇 걸음만 보정해도 하루 이내로 수렴한다 */
export function solarTermsForYear(year: number): { date: DateStr; name: string }[] {
  return TERMS.map((term) => {
    let jd = toJulianDay(year, term.month, term.day);
    for (let i = 0; i < 6; i++) {
      const diff = angleDiff(apparentSolarLongitude(jd), term.longitude);
      if (Math.abs(diff) < 0.0001) break;
      jd -= diff / DEG_PER_DAY;
    }
    return { date: jdToKstDateStr(jd), name: term.name };
  });
}

/**
 * [from, to] 구간의 절기. 달력 그리드가 월·해 경계를 넘어가므로 앞뒤 해도 같이 훑는다
 * (연말/연초 그리드 칸이 다음 해 1월 절기를 담아야 할 수도 있다).
 */
export function solarTermsInRange(from: DateStr, to: DateStr): Map<DateStr, string> {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const map = new Map<DateStr, string>();
  for (let y = fromYear - 1; y <= toYear + 1; y++) {
    for (const { date, name } of solarTermsForYear(y)) {
      if (date >= from && date <= to) map.set(date, name);
    }
  }
  return map;
}
