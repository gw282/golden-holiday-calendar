import { addDays, diffDays, isValidDateStr, type DateStr } from "./date";
import { MAX_REPEAT_COUNT, type CreateInput, type Event, type RepeatFreq } from "./events";

/**
 * iCalendar(.ics) 내보내기 · 가져오기.
 *
 * 데이터가 `data/app.db` 한 파일에만 있어서 백업 수단이 없었다. `.ics`로 뽑으면
 * 백업이 되는 동시에 구글·애플 캘린더에 그대로 들어가고, 반대로 회사 캘린더에서 받은
 * 파일을 넣으면 그 날들이 `busyDates`에 잡혀 연차 추천 품질까지 올라간다.
 *
 * 시각은 **떠 있는 시각(floating time)** 으로 쓴다 — `Z`도 `TZID`도 붙이지 않는다.
 * 이 앱은 날짜를 `YYYY-MM-DD` 문자열로만 다루고 타임존 개념이 없으므로,
 * UTC로 바꿔 적으면 넣고 빼는 사이에 하루가 밀 수 있다.
 *
 * `done`·`color`·`series_id`는 표준에 자리가 없어 `X-GH-*` 확장으로 싣는다.
 * 다른 캘린더는 모르는 X- 속성을 무시하고, 우리가 다시 읽을 때는 살아난다.
 */

const PRODID = "-//mg-manage//KO";
/** 한 번에 받아들일 최대 건수 — 남의 캘린더를 통째로 넣어 DB가 터지는 것을 막는다 */
export const MAX_IMPORT = 500;

// ── 내보내기 ─────────────────────────────────────────────

/** 텍스트 값 이스케이프. 역슬래시를 먼저 바꿔야 뒤에 넣은 것이 두 번 이스케이프되지 않는다 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** `2026-09-02` → `20260902` */
function icsDate(d: DateStr): string {
  return d.replace(/-/g, "");
}

/** `2026-09-02` + `11:00` → `20260902T110000` */
function icsDateTime(d: DateStr, time: string): string {
  return `${icsDate(d)}T${time.replace(":", "")}00`;
}

/**
 * 75옥텟마다 접는다(RFC 5545 3.1). 한글은 UTF-8에서 3바이트라 글자 수로 세면 안 되고,
 * 글자 중간에서 자르면 깨지므로 코드포인트 단위로 넣다가 넘칠 때 끊는다.
 */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // 이어지는 줄은 앞에 공백 한 칸이 붙으므로 그만큼 여유를 둔다
    if (bytes + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function toIcs(events: Event[], stamp = new Date()): string {
  const dtstamp = `${stamp.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
  ];

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@mg-manage.local`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`SUMMARY:${escapeText(e.title)}`);

    if (e.startTime === null) {
      // 하루 종일은 DATE 값이고 DTEND가 **열린 구간**이다 — 종료일 다음 날을 적는다.
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(e.endDate, 1))}`);
    } else {
      lines.push(`DTSTART:${icsDateTime(e.date, e.startTime)}`);
      // 종료 시각이 없으면 DTEND를 아예 적지 않는다. 한 시간짜리로 꾸며 내면
      // 없던 정보를 만드는 것이고, 다시 읽을 때 그 값이 진짜처럼 들어온다.
      if (e.endTime) lines.push(`DTEND:${icsDateTime(e.endDate, e.endTime)}`);
    }

    if (e.memo) lines.push(`DESCRIPTION:${escapeText(e.memo)}`);
    if (e.color) lines.push(`X-GH-COLOR:${e.color}`);
    if (e.done) lines.push("X-GH-DONE:1");
    if (e.seriesId) lines.push(`X-GH-SERIES:${e.seriesId}`);
    // 연차는 이 앱의 고유 자산이다. 안 실으면 내보냈다 되돌렸을 때 잔고가 0이 된다 —
    // 그러면 백업이 아니라 데이터를 지우는 기능이 된다.
    if (e.isLeave) {
      lines.push("X-GH-LEAVE:1");
      // null은 '자동 계산'이라는 뜻이라 값이 있을 때만 적는다. 안 적으면 읽는 쪽도 자동으로 둔다.
      if (e.leaveDays !== null) lines.push(`X-GH-LEAVE-DAYS:${e.leaveDays}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ── 가져오기 ─────────────────────────────────────────────

function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, c: string) =>
    c === "n" || c === "N" ? "\n" : c,
  );
}

/** `20260902` → `2026-09-02`. 값이 날짜로 안 읽히면 null */
function fromIcsDate(v: string): DateStr | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  return isValidDateStr(d) ? d : null;
}

/** `20260902T110000` → `11:00`. 시각이 없으면 null (= 하루 종일) */
function fromIcsTime(v: string): string | null {
  const m = /^\d{8}T(\d{2})(\d{2})/.exec(v);
  if (!m) return null;
  const time = `${m[1]}:${m[2]}`;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
}

/** 이 앱이 사는 시간대. 화면·DB의 모든 시각이 이 기준이다 */
const APP_TZ = "Asia/Seoul";

/**
 * 남의 캘린더가 준 날짜·시각을 **이 앱의 시간대로** 맞춘다.
 *
 * 우리가 내보낼 때는 떠 있는 시각(floating)을 쓰지만 **받을 때는 그럴 수 없다** —
 * 구글·아웃룩이 내보낸 파일은 `...T140000Z`(UTC)나 `TZID=America/New_York`으로 온다.
 * 글자 그대로 읽으면 14:00Z 회의가 23:00이 아니라 14:00으로 들어가 **아홉 시간이 어긋난다.**
 *
 * 날짜까지 같이 돌려주는 이유: 시각을 옮기면 **날짜가 넘어갈 수 있다**
 * (20:00Z = 다음 날 05:00). 시각만 고치면 회의가 하루 전날에 남는다.
 */
function toLocalParts(
  value: string,
  params: string,
): { date: DateStr; time: string | null } | null {
  const date = fromIcsDate(value);
  if (!date) return null;
  const time = fromIcsTime(value);
  // 날짜만 있는 값(하루 종일)은 시간대와 무관하다. 옮기면 오히려 하루가 밀린다
  if (time === null) return { date, time: null };

  const tzid = /TZID=([^;:]+)/.exec(params)?.[1];
  const isUtc = value.endsWith("Z");
  // 떠 있는 시각이거나 이미 우리 시간대면 손대지 않는다
  if (!isUtc && (!tzid || tzid === APP_TZ.toUpperCase() || tzid === APP_TZ)) {
    return { date, time };
  }

  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // UTC면 그 자체가 순간이고, TZID면 그 지역의 벽시계라 오프셋만큼 되돌려야 순간이 된다
  const instant = isUtc ? wall : wall - offsetMs(wall, tzid as string);
  return formatIn(instant, APP_TZ);
}

/**
 * 그 순간 해당 시간대의 UTC 오프셋(ms).
 *
 * `Intl`은 "순간 → 벽시계"만 해 주고 반대는 없다. 그래서 벽시계 값을 일단 UTC인 척
 * 계산해 오프셋을 구한 뒤 되돌린다. 서머타임이 바뀌는 한두 시간 구간에서는 한 시간
 * 어긋날 수 있는데, 그것까지 맞추려면 tz 데이터베이스를 직접 다뤄야 한다.
 * 여기 목적은 **아홉 시간짜리 오류를 없애는 것**이라 이 정도면 충분하다.
 */
function offsetMs(guess: number, tz: string): number {
  const parts = formatIn(guess, tz);
  if (!parts) return 0;
  const [y, mo, d] = parts.date.split("-").map(Number);
  const [h, mi] = parts.time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - guess;
}

/** 순간(ms) → 그 시간대의 `YYYY-MM-DD` + `HH:MM` */
function formatIn(instant: number, tz: string): { date: DateStr; time: string } | null {
  let got: Record<string, string>;
  try {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    got = {};
    for (const part of f.formatToParts(new Date(instant))) got[part.type] = part.value;
  } catch {
    // 모르는 TZID면 손대지 않는다. 틀린 방향으로 옮기느니 그대로 두는 편이 낫다
    return null;
  }
  const date = `${got.year}-${got.month}-${got.day}`;
  if (!isValidDateStr(date)) return null;
  // 자정을 24로 주는 환경이 있다
  const hour = got.hour === "24" ? "00" : got.hour;
  return { date, time: `${hour}:${got.minute}` };
}
/**
 * `RRULE`에서 읽어 낸 반복 힌트.
 *
 * **우리가 직접 펼치지 않는다.** `EXDATE`(취소된 회차)와 `RECURRENCE-ID`(한 회차만
 * 옮긴 것)까지 맞추지 않으면 있지도 않은 회의가 달력에 찍히기 때문이다.
 * 대신 "매주 12회짜리로 보입니다"까지만 읽어 **미리보기에서 사람이 확인·수정**하게 하고,
 * 확정되면 이 앱이 원래 쓰던 반복 기능(`repeat`)으로 행을 만든다.
 * 규칙을 반쯤 흉내 내느니 사람에게 한 번 묻는 편이 정확하다.
 */
export type RepeatHint = {
  freq: RepeatFreq;
  count: number;
  /** 파일에 횟수가 없어 우리가 어림한 값인가 (사람이 고칠 값이라는 표시) */
  guessed: boolean;
};

/** 한 건의 파싱 결과 — 일정 본체와 반복 힌트 */
export type IcsItem = {
  input: CreateInput;
  repeat: RepeatHint | null;
  /** 반복 규칙은 있었지만 이 앱이 못 다루는 주기(예: 매일)면 그 이름 */
  unsupportedRepeat: string | null;
};

export type IcsParseResult = {
  events: CreateInput[];
  /** 일정 + 반복 힌트. 미리보기가 쓴다 */
  items: IcsItem[];
  /** 날짜를 못 읽어 건너뛴 VEVENT 수 */
  skipped: number;
};

/**
 * VEVENT만 최소한으로 읽는다. RRULE·VALARM·VTIMEZONE은 무시한다 —
 * 반복은 이 앱이 행을 실제로 여러 개 만드는 방식이라 규칙을 그대로 받아 둘 자리가 없다.
 */
export function parseIcs(text: string): IcsParseResult {
  // 접힌 줄 펴기: 줄바꿈 뒤 공백/탭으로 시작하면 앞 줄에 이어진 것이다
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const events: CreateInput[] = [];
  const items: IcsItem[] = [];
  let skipped = 0;
  let cur: Record<string, { value: string; params: string }> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) {
        const built = buildInput(cur);
        if (built) {
          events.push(built);
          const rr = readRrule(cur.RRULE?.value ?? "", built.date);
          items.push({ input: built, repeat: rr.hint, unsupportedRepeat: rr.unsupported });
        } else skipped += 1;
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const semi = head.indexOf(";");
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    // 같은 속성이 여러 번 나오면 첫 번째만 쓴다 (번역된 SUMMARY가 여러 줄인 파일이 있다)
    if (!(name in cur)) {
      cur[name] = { value, params: semi < 0 ? "" : head.slice(semi + 1).toUpperCase() };
    }
  }

  return { events, items, skipped };
}

/**
 * `FREQ=WEEKLY;BYDAY=WE;COUNT=12` → `{ freq: "weekly", count: 12 }`
 *
 * 횟수를 못 읽는 경우가 흔하다(`UNTIL`만 있거나 아예 끝이 없다). 그때는 어림하고
 * `guessed`를 세워, 미리보기 화면이 "이건 고쳐야 할 값"이라고 말하게 한다.
 */
function readRrule(
  rule: string,
  start: DateStr,
): { hint: RepeatHint | null; unsupported: string | null } {
  if (!rule) return { hint: null, unsupported: null };

  const parts = new Map<string, string>();
  for (const chunk of rule.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts.set(chunk.slice(0, eq).toUpperCase(), chunk.slice(eq + 1));
  }

  const freqMap: Record<string, RepeatFreq> = {
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    YEARLY: "yearly",
  };
  const raw = (parts.get("FREQ") ?? "").toUpperCase();
  const freq = freqMap[raw];
  // 이 앱의 반복은 주·월·년뿐이다. 매일 반복은 두 달이면 상한을 넘어 담을 그릇이 없다
  if (!freq) return { hint: null, unsupported: raw || "알 수 없음" };

  const cap = (n: number) => Math.max(1, Math.min(MAX_REPEAT_COUNT, Math.round(n)));

  const count = Number(parts.get("COUNT"));
  if (Number.isFinite(count) && count > 0) {
    return { hint: { freq, count: cap(count), guessed: false }, unsupported: null };
  }

  const until = parts.get("UNTIL");
  const untilDate = until ? fromIcsDate(until) : null;
  if (untilDate && untilDate > start) {
    const days = diffDays(start, untilDate);
    const per = freq === "weekly" ? 7 : freq === "monthly" ? 30 : 365;
    return { hint: { freq, count: cap(days / per + 1), guessed: true }, unsupported: null };
  }

  // 끝이 없는 반복. 무한을 그대로 옮길 수는 없으니 눈에 보이는 만큼만 어림한다
  const fallback = freq === "weekly" ? 12 : freq === "monthly" ? 12 : 3;
  return { hint: { freq, count: fallback, guessed: true }, unsupported: null };
}

function buildInput(
  props: Record<string, { value: string; params: string }>,
): CreateInput | null {
  const dtstart = props.DTSTART;
  if (!dtstart) return null;

  const allDay = dtstart.params.includes("VALUE=DATE") || !dtstart.value.includes("T");

  // UTC(Z)·TZID로 온 시각을 우리 시간대로 옮긴다. 날짜가 같이 넘어갈 수 있어
  // 날짜와 시각을 한 번에 받는다 (20:00Z = 다음 날 05:00).
  const start = toLocalParts(dtstart.value, dtstart.params);
  if (!start) return null;
  const date = start.date;
  const startTime = allDay ? null : start.time;

  let endDate = date;
  let endTime: string | null = null;
  const dtend = props.DTEND;
  if (dtend) {
    const end = toLocalParts(dtend.value, dtend.params);
    if (end) {
      // 하루 종일의 DTEND는 열린 구간이라 하루를 뺀다. 하루짜리면 시작일과 같아진다.
      endDate = allDay ? addDays(end.date, -1) : end.date;
      if (!allDay) endTime = end.time;
    }
  }
  // 뺀 결과가 시작일보다 앞서면(길이 0인 DTEND) 하루짜리로 본다
  if (endDate < date) endDate = date;

  const title = props.SUMMARY ? unescapeText(props.SUMMARY.value).trim() : "";

  return {
    title: title || "제목 없음",
    date,
    endDate,
    startTime,
    endTime,
    memo: props.DESCRIPTION ? unescapeText(props.DESCRIPTION.value).trim() : "",
    color: props["X-GH-COLOR"]?.value ?? "",
    done: props["X-GH-DONE"]?.value === "1",
    // 내보낼 때 적어 놓고 읽지 않으면 왕복이 성립하지 않는다.
    // seriesId를 버리면 복원한 반복 일정이 흩어져 '반복 전체 삭제'를 못 쓰게 된다.
    seriesId: props["X-GH-SERIES"]?.value ?? "",
    isLeave: props["X-GH-LEAVE"]?.value === "1",
    leaveDays: props["X-GH-LEAVE-DAYS"] ? Number(props["X-GH-LEAVE-DAYS"].value) : null,
  };
}
