import { all, get, run, batch } from "./db";
import { addDays, diffDays, eachDay, isValidDateStr, minutesOf, type DateStr } from "./date";
import { isEventColorKey } from "./eventColors";
import { REMINDER_THRESHOLD_OPTIONS } from "./settings";

export type EventRow = {
  id: number;
  title: string;
  date: DateStr;
  end_date: DateStr;
  start_time: string | null;
  end_time: string | null;
  memo: string;
  done: number; // SQLite에는 BOOLEAN이 없어 0 | 1
  color: string;
  series_id: string;
  is_leave: number;
  leave_type_id: number | null;
  leave_days: number | null;
  google_id: string;
  import_batch_id: number | null;
  reminder_minutes: number | null;
  created_at: string;
  /** 준비물 개수 — 표에 있는 열이 아니라 SELECT가 세어 붙이는 값이다 */
  tasks_total?: number;
  tasks_done?: number;
};

/** API·UI가 쓰는 형태. done을 boolean으로 바꿔 내보낸다. */
export type Event = {
  id: number;
  title: string;
  /** 시작일 */
  date: DateStr;
  /**
   * 종료일. 하루짜리면 시작일과 같다.
   * NULL을 두지 않는 이유: 'date <= d <= endDate' 한 조건으로 모든 조회가 끝나기 때문이다.
   */
  endDate: DateStr;
  /** 시작 시각. null이면 **하루 종일** 일정이다 */
  startTime: string | null;
  /** 종료 시각. 시작 시각이 있을 때만 의미가 있다 */
  endTime: string | null;
  memo: string;
  done: boolean;
  /** lib/eventColors.ts의 키. 빈 값이면 기본색 */
  color: string;
  /** 반복으로 만들어진 일정이면 같은 묶음끼리 공유하는 id. 아니면 빈 값 */
  seriesId: string;
  /** 연차를 쓰는 일정인가 */
  isLeave: boolean;
  /** 어느 휴가인지. null이면 기본 종류(연차) */
  leaveTypeId: number | null;
  /**
   * 실제로 낸 연차 일수. **null이면 '자동'** — 기간에서 주말·공휴일을 뺀 날수를 쓴다.
   * 반차(0.5)·반반차(0.25)처럼 자동값과 다를 때만 숫자가 들어간다.
   * 자동값을 구하려면 공휴일이 필요하므로 계산은 `lib/leave.ts`가 맡는다.
   */
  leaveDays: number | null;
  /**
   * 구글 캘린더에서 받아 온 일정이면 그쪽 id. **빈 값이면 이 앱에서 만든 것**이다.
   * 다시 받아 올 때 짝을 맞추는 열쇠이자, 목록에서 '구글' 표시를 붙이는 근거다.
   */
  googleId: string;
  /** 한 번의 가져오기로 들어왔으면 그 번호. 통째로 되돌릴 때 쓴다 */
  importBatchId: number | null;
  /**
   * 이 일정만 몇 분 전에 알릴지(설치본 알림 전용). null이면 헤더의 전역
   * '알림 시점' 설정(`lib/settings.ts`의 `getReminderThresholds`)을 그대로 따른다.
   */
  reminderMinutes: number | null;
  createdAt: string;
  /** 딸린 준비물 개수. 목록에 `준비물 2/5`를 적는 데 쓴다 */
  tasksTotal: number;
  tasksDone: number;
};

/** 여러 날에 걸친 일정인지 */
export function isMultiDay(e: Event): boolean {
  return e.endDate > e.date;
}

function toEvent(r: EventRow): Event {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    endDate: r.end_date || r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    memo: r.memo,
    done: Boolean(r.done),
    color: r.color ?? "",
    seriesId: r.series_id ?? "",
    isLeave: Boolean(r.is_leave),
    leaveTypeId: r.leave_type_id === null || r.leave_type_id === undefined ? null : Number(r.leave_type_id),
    leaveDays: r.leave_days === null || r.leave_days === undefined ? null : Number(r.leave_days),
    googleId: r.google_id ?? "",
    importBatchId:
      r.import_batch_id === null || r.import_batch_id === undefined
        ? null
        : Number(r.import_batch_id),
    reminderMinutes:
      r.reminder_minutes === null || r.reminder_minutes === undefined
        ? null
        : Number(r.reminder_minutes),
    createdAt: r.created_at,
    tasksTotal: r.tasks_total ?? 0,
    tasksDone: r.tasks_done ?? 0,
  };
}

/** 시작일 → 긴 일정 먼저 → 시간(없으면 뒤) → id 순 */
const ORDER = `ORDER BY date, (julianday(end_date) - julianday(date)) DESC, start_time IS NULL, start_time, id`;

/**
 * 일정을 읽는 공통 SELECT.
 *
 * 준비물 개수를 상관 서브쿼리로 같이 가져온다. 목록에 `준비물 2/5`를 적으려면 개수가
 * 필요한데, 화면에서 일정마다 따로 물으면 요청이 건수만큼 늘어난다.
 */
const SELECT = `
  SELECT e.*,
    (SELECT COUNT(*) FROM event_tasks t WHERE t.event_id = e.id) AS tasks_total,
    (SELECT COUNT(*) FROM event_tasks t WHERE t.event_id = e.id AND t.done = 1) AS tasks_done
  FROM events e`;

export async function listEvents(): Promise<Event[]> {
  const rows = await all<EventRow>(`${SELECT} ${ORDER}`);
  return rows.map(toEvent);
}

/** 그 날에 걸쳐 있는 일정 — 시작일이 그 날인 것만이 아니라 기간에 포함되면 나온다 */
export async function listEventsByDate(date: DateStr): Promise<Event[]> {
  const rows = await all<EventRow>(`${SELECT} WHERE date <= ? AND end_date >= ? ${ORDER}`, [
    date,
    date,
  ]);
  return rows.map(toEvent);
}

/** [from, to]와 하루라도 겹치는 일정 */
export async function listEventsBetween(from: DateStr, to: DateStr): Promise<Event[]> {
  const rows = await all<EventRow>(`${SELECT} WHERE date <= ? AND end_date >= ? ${ORDER}`, [
    to,
    from,
  ]);
  return rows.map(toEvent);
}

export async function getEvent(id: number): Promise<Event | null> {
  const row = await get<EventRow>(`${SELECT} WHERE e.id = ?`, [id]);
  return row ? toEvent(row) : null;
}

export type CreateInput = {
  title: string;
  date: DateStr;
  /** 비우면 하루짜리 (= 시작일과 같게 저장) */
  endDate?: DateStr | null;
  startTime?: string | null;
  endTime?: string | null;
  memo?: string;
  color?: string | null;
  /**
   * 반복. 없으면 한 건만 만든다. 횟수(count) 또는 종료일(until) 중 하나로 정한다 —
   * "몇 월 며칠까지 반복"을 고를 수 있게 둘 다 받는다.
   */
  repeat?: { freq: RepeatFreq; count: number } | { freq: RepeatFreq; until: DateStr } | null;
  /**
   * 반복 묶음 id를 직접 지정한다. `.ics` 가져오기 전용이다 —
   * 내보낼 때 적어 둔 묶음을 그대로 되살려야 '반복 전체 삭제'가 계속 동작한다.
   * 화면에서 만들 때는 비워 두고 `repeat`이 알아서 만들게 한다.
   */
  seriesId?: string;
  /** 연차를 쓰는 일정인가 */
  isLeave?: boolean;
  /** 어느 휴가를 썼는지. 비우면 기본 종류(연차)로 본다 */
  leaveTypeId?: number | null;
  /** 자동값(주말·공휴일 뺀 날수)과 다르게 낼 때만. 비우면 자동이다 */
  leaveDays?: number | null;
  /**
   * 완료 상태로 만든다. 화면에서 쓰는 길은 없고 `.ics` 가져오기 전용이다 —
   * 내보낸 파일을 다시 넣었을 때 완료 표시가 풀려 버리면 백업이 아니다.
   */
  done?: boolean;
  /**
   * 이 일정만 몇 분 전에 알릴지. 비우면(null/undefined) 전역 설정을 따른다.
   * `lib/settings.ts`의 `REMINDER_THRESHOLD_OPTIONS`에 있는 값만 받는다.
   */
  reminderMinutes?: number | null;
  /**
   * 구글 캘린더 원본 id. **동기화 전용**이다 — 화면에서 만들 때는 비운다.
   * 값이 있으면 그 일정은 구글이 주인이라, 다음 동기화 때 이쪽 수정이 덮인다.
   */
  googleId?: string;
  /** 가져오기 묶음 번호. 화면에서 만들 때는 비운다 */
  importBatchId?: number | null;
};

export type RepeatFreq = "weekly" | "monthly" | "yearly";

/** 한 번에 만들 수 있는 반복 횟수 상한. 실수로 수백 건이 들어가는 것을 막는다 */
export const MAX_REPEAT_COUNT = 60;

/** 검증 실패 시 메시지를 던진다. Route Handler가 400으로 바꿔 응답한다. */
export class ValidationError extends Error {}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !TIME_RE.test(v)) {
    throw new ValidationError(label + "은 'HH:MM' 형식이어야 합니다.");
  }
  return v;
}

/** 색은 팔레트에 있는 키만 받는다. 빈 값은 기본색을 뜻한다. */
function normalizeColor(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (!isEventColorKey(v)) throw new ValidationError("색이 올바르지 않습니다.");
  return v as string;
}

/**
 * 비어 있으면 null(= 전역 알림 설정을 따름). 0이면 이 일정만 알림을 아예 끈 것 —
 * 전역 설정과 무관하게 이 일정에는 알림을 보내지 않는다. 그 외엔 정해진
 * 선택지(15/30/60/120분)만 받는다.
 */
function normalizeReminderMinutes(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (n === 0) return 0;
  const options: readonly number[] = REMINDER_THRESHOLD_OPTIONS;
  if (!options.includes(n)) {
    throw new ValidationError(`알림 시점은 0(끄기) 또는 ${REMINDER_THRESHOLD_OPTIONS.join("/")}분 전 중 하나여야 합니다.`);
  }
  return n;
}

/**
 * 연차 일수. 0이면 연차를 쓰지 않는 보통 일정이다.
 *
 * 상한을 기간 일수로 묶지 않는 이유: 반차를 두 번 낸 날처럼 기간보다 큰 값이 나올 일은
 * 없지만, 여기서 막으면 시작일만 옮길 때(기간 유지) 검증이 순서에 얽힌다.
 * 음수와 터무니없는 값만 걷어낸다.
 */
const MAX_LEAVE_DAYS = 365;
/** 반차(0.5)·반반차(0.25)까지 받는다. 그보다 잘게 쪼개 쓰는 제도는 없다 */
export const LEAVE_STEP = 0.25;

/** 비어 있으면 null(= 자동 계산)이다. 0을 넣는 것과 다르다 — 0은 '연차인데 0일'이다. */
function normalizeLeaveDays(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_LEAVE_DAYS) {
    throw new ValidationError(`연차 일수는 0~${MAX_LEAVE_DAYS} 사이여야 합니다.`);
  }
  if (!Number.isInteger(n / LEAVE_STEP)) {
    throw new ValidationError(`연차 일수는 ${LEAVE_STEP}일 단위로 넣어 주세요.`);
  }
  return n;
}

/** 비어 있으면 시작일과 같게. 값이 있으면 형식과 순서를 확인한다. */
function normalizeEndDate(v: unknown, start: DateStr): DateStr {
  if (v === undefined || v === null || v === "") return start;
  if (!isValidDateStr(v)) throw new ValidationError("종료일은 'YYYY-MM-DD' 형식이어야 합니다.");
  if (v < start) throw new ValidationError("종료일은 시작일보다 빠를 수 없습니다.");
  return v;
}

/**
 * 반복 시작일들. 첫 회차는 항상 시작일 자신이다.
 *
 * 매월·매년은 **같은 날짜**를 지킨다. 그 달에 없는 날(1/31 → 2월)은 만들지 않고 건너뛴다 —
 * 말없이 2/28로 당겨 놓으면 사용자가 넣은 적 없는 날짜가 생긴다.
 *
 * `count`(횟수)와 `until`(종료일) 중 하나로 언제까지 반복할지 정한다. `until`일 때는
 * MAX_REPEAT_COUNT를 넘어가는 순간 예외를 던진다 — 종료일이 너무 멀어서 조용히
 * 잘리면 사용자가 고른 날짜와 실제로 생긴 마지막 회차가 어긋난다.
 */
function repeatDates(
  start: DateStr,
  freq: RepeatFreq,
  spec: { count: number } | { until: DateStr },
): DateStr[] {
  const out: DateStr[] = [];
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  const d = Number(start.slice(8, 10));
  const until = "until" in spec ? spec.until : null;
  // count 모드는 그 횟수만큼만 돈다. until 모드는 상한(+1)까지 돌며 넘치는지 확인한다.
  const iterations = "count" in spec ? spec.count : MAX_REPEAT_COUNT + 1;

  for (let i = 0; i < iterations; i++) {
    let date: DateStr | null;
    if (freq === "weekly") {
      date = addDays(start, i * 7);
    } else {
      const at =
        freq === "monthly"
          ? new Date(Date.UTC(y, m - 1 + i, d))
          : new Date(Date.UTC(y + i, m - 1, d));
      // 넘긴 날짜가 그대로 살아 있는지 확인한다 (2월 31일은 3월로 밀려나므로 버린다)
      date = at.getUTCDate() === d ? at.toISOString().slice(0, 10) : null;
    }
    if (date === null) continue;
    if (until !== null) {
      if (date > until) break;
      if (out.length >= MAX_REPEAT_COUNT) {
        throw new ValidationError(
          `반복 종료일까지 ${MAX_REPEAT_COUNT}회를 넘습니다 — 종료일을 당겨 주세요.`,
        );
      }
    }
    out.push(date);
  }

  return out;
}

export async function createEvent(input: CreateInput): Promise<Event> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) throw new ValidationError("제목을 입력해 주세요.");
  if (!isValidDateStr(input.date)) throw new ValidationError("날짜는 'YYYY-MM-DD' 형식이어야 합니다.");

  const endDate = normalizeEndDate(input.endDate, input.date);
  const startTime = normalizeTime(input.startTime, "시작 시각");
  // 시작 시각이 없으면 하루 종일 일정이라 종료 시각도 의미가 없다
  const endTime = startTime === null ? null : normalizeTime(input.endTime, "종료 시각");
  // **같은 날에 끝날 때만** 따진다. 자정을 넘기는 일정(23:00~00:30)은 종료 시각이
  // 시작보다 작은 게 정상이고, 그건 endDate가 하루 뒤라는 사실이 이미 말해 준다.
  // 이 조건이 없으면 밤에 걸친 회의를 가져올 때 통째로 버려진다.
  if (endDate === input.date && endTime !== null && startTime !== null && endTime < startTime) {
    throw new ValidationError("종료 시각은 시작 시각보다 빠를 수 없습니다.");
  }
  const memo = typeof input.memo === "string" ? input.memo.trim() : "";
  const color = normalizeColor(input.color);
  const reminderMinutes = normalizeReminderMinutes(input.reminderMinutes);
  const isLeave = Boolean(input.isLeave);
  // 연차가 아니면 종류도 뜻이 없다
  const leaveTypeId = isLeave && input.leaveTypeId ? Number(input.leaveTypeId) : null;
  // 연차가 아니면 일수는 의미가 없다. 껐을 때 옛 값이 남아 잔고에 섞이지 않도록 지운다.
  const leaveDays = isLeave ? normalizeLeaveDays(input.leaveDays) : null;

  // 반복은 규칙을 저장하지 않고 **행을 실제로 여러 개** 만든다.
  // 그래야 달력·busyDates·수정·삭제가 하나짜리 일정과 똑같이 동작한다.
  const repeat = normalizeRepeat(input.repeat);
  const starts = repeat
    ? repeatDates(input.date, repeat.freq, "until" in repeat ? { until: repeat.until } : { count: repeat.count })
    : [input.date as DateStr];
  if (repeat && starts.length === 0) {
    throw new ValidationError("반복 종료일이 시작일보다 빠릅니다.");
  }
  // 가져오기가 넘겨 준 묶음 id가 있으면 그대로 쓴다 (백업 복원). 없으면 반복이 새로 만든다.
  const seriesId =
    typeof input.seriesId === "string" && input.seriesId
      ? input.seriesId
      : repeat && starts.length > 1
        ? crypto.randomUUID()
        : "";

  // 기간(일수)은 회차마다 그대로 유지한다
  const span = diffDays(input.date, endDate);

  const sql = `INSERT INTO events (title, date, end_date, start_time, end_time, memo, color, series_id, is_leave, leave_type_id, leave_days, done, google_id, import_batch_id, reminder_minutes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // 반복 일정은 회차가 60개까지 나온다. 하나씩 await하면 원격 DB에서 왕복이 60번이라
  // '한 번 추가'가 눈에 보이게 느려진다. 한 트랜잭션으로 묶어 한 번에 보낸다.
  const results = await batch(
    starts.map((start) => ({
      sql,
      args: [
        title,
        start,
        addDays(start, span),
        startTime,
        endTime,
        memo,
        color,
        seriesId,
        isLeave ? 1 : 0,
        leaveTypeId,
        leaveDays,
        input.done ? 1 : 0,
        typeof input.googleId === "string" ? input.googleId : "",
        typeof input.importBatchId === "number" ? input.importBatchId : null,
        reminderMinutes,
      ],
    })),
  );

  const first = results[0]?.lastInsertRowid;
  const firstId = first === undefined ? 0 : Number(first);
  return (await getEvent(firstId))!;
}

function normalizeRepeat(
  v: CreateInput["repeat"],
): { freq: RepeatFreq; count: number } | { freq: RepeatFreq; until: DateStr } | null {
  if (!v) return null;
  if (!["weekly", "monthly", "yearly"].includes(v.freq)) {
    throw new ValidationError("반복 주기가 올바르지 않습니다.");
  }
  if ("until" in v && v.until) {
    if (!isValidDateStr(v.until)) {
      throw new ValidationError("반복 종료일은 'YYYY-MM-DD' 형식이어야 합니다.");
    }
    return { freq: v.freq, until: v.until };
  }
  const count = Math.trunc(Number((v as { count: number }).count));
  if (!Number.isFinite(count) || count < 1 || count > MAX_REPEAT_COUNT) {
    throw new ValidationError(`반복 횟수는 1~${MAX_REPEAT_COUNT} 사이여야 합니다.`);
  }
  return { freq: v.freq, count };
}

/**
 * 같은 일정이 이미 있는지 — `.ics`를 두 번 넣어도 건수가 늘지 않게 하는 데 쓴다.
 *
 * 제목·시작일·종료일·시작시각이 모두 같으면 같은 일정으로 본다. 메모나 색까지 보면
 * 남의 캘린더에서 받은 파일을 다시 받을 때 사소한 차이로 중복이 생긴다.
 */
export async function eventExists(input: {
  title: string;
  date: DateStr;
  endDate: DateStr;
  startTime: string | null;
}): Promise<boolean> {
  const row = await get(
    // start_time에는 NULL(하루 종일)이 들어가므로 =가 아니라 IS로 비교한다
    `SELECT 1 FROM events
     WHERE title = ? AND date = ? AND end_date = ? AND start_time IS ?
     LIMIT 1`,
    [input.title, input.date, input.endDate, input.startTime],
  );
  return row !== undefined;
}

/** 같은 반복 묶음 전체를 지운다. 지운 개수를 돌려준다. */
export async function deleteSeries(seriesId: string): Promise<number> {
  if (!seriesId) return 0;
  const { rowsAffected } = await run(`DELETE FROM events WHERE series_id = ?`, [seriesId]);
  return rowsAffected;
}

export type UpdateInput = Partial<{
  title: string;
  date: DateStr;
  endDate: DateStr | null;
  startTime: string | null;
  endTime: string | null;
  memo: string;
  color: string | null;
  isLeave: boolean;
  leaveTypeId: number | null;
  leaveDays: number | null;
  done: boolean;
  reminderMinutes: number | null;
}>;

/** 전달된 필드만 갱신한다 (완료 토글도 이 함수로 처리). */
export async function updateEvent(id: number, patch: UpdateInput): Promise<Event | null> {
  const current = await getEvent(id);
  if (!current) return null;

  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (patch.title !== undefined) {
    const title = typeof patch.title === "string" ? patch.title.trim() : "";
    if (!title) throw new ValidationError("제목은 비울 수 없습니다.");
    sets.push("title = ?");
    values.push(title);
  }

  let nextStart = current.date;
  if (patch.date !== undefined) {
    if (!isValidDateStr(patch.date)) throw new ValidationError("날짜는 'YYYY-MM-DD' 형식이어야 합니다.");
    nextStart = patch.date;
    sets.push("date = ?");
    values.push(nextStart);
  }

  // 아래 종료 시각 검사가 "같은 날에 끝나는가"를 알아야 해서 바뀐 뒤의 종료일을 들고 간다
  let nextEnd = current.endDate;
  if (patch.endDate !== undefined) {
    nextEnd = normalizeEndDate(patch.endDate, nextStart);
    sets.push("end_date = ?");
    values.push(nextEnd);
  } else if (patch.date !== undefined) {
    // 시작일만 옮겼으면 기간(일수)은 그대로 두고 종료일도 같이 민다.
    // 안 그러면 3일짜리 일정을 하루 미룰 때 종료일이 시작일보다 빨라진다.
    nextEnd = addDays(nextStart, diffDays(current.date, current.endDate));
    sets.push("end_date = ?");
    values.push(nextEnd);
  }

  // 시작 시각을 지우면(=하루 종일) 종료 시각도 같이 지운다. 안 그러면 끝만 남는다.
  const nextStartTime =
    patch.startTime !== undefined ? normalizeTime(patch.startTime, "시작 시각") : current.startTime;
  if (patch.startTime !== undefined) {
    sets.push("start_time = ?");
    values.push(nextStartTime);
  }

  // 시작 시각만 바꿔도 종료 시각을 다시 검사해야 한다.
  // 안 그러면 09:00~10:00 일정의 시작만 23:00으로 옮겨 '23:00~10:00'이 저장된다.
  if (patch.startTime !== undefined || patch.endTime !== undefined) {
    const rawEnd = patch.endTime !== undefined ? patch.endTime : current.endTime;

    if (nextStartTime === null) {
      // 하루 종일인데 종료 시각을 넣으려 하면 조용히 버리지 않고 알린다
      if (patch.endTime) {
        throw new ValidationError("하루 종일 일정에는 종료 시각을 넣을 수 없습니다.");
      }
      sets.push("end_time = ?");
      values.push(null);
    } else {
      const endTime = normalizeTime(rawEnd, "종료 시각");
      // 같은 날에 끝날 때만 따진다 (createEvent와 같은 이유 — 자정을 넘기는 일정)
      if (nextEnd === nextStart && endTime !== null && endTime < nextStartTime) {
        throw new ValidationError("종료 시각은 시작 시각보다 빠를 수 없습니다.");
      }
      sets.push("end_time = ?");
      values.push(endTime);
    }
  } else if (
    // 시각은 그대로인데 **종료일만 당겨** 하루짜리가 된 경우.
    // 23:00~00:30짜리 이틀 일정의 종료일을 시작일과 같게 만들면 같은 날에
    // 끝이 시작보다 빠른 상태가 남는다. 막지 않고 **종료 시각을 지운다** —
    // 시작 시각을 지울 때 종료 시각을 같이 지우는 것과 같은 이유이고,
    // 날짜를 고쳤는데 시각 얘기로 거절당하면 사용자는 영문을 모른다.
    nextEnd === nextStart &&
    nextStartTime !== null &&
    current.endTime !== null &&
    current.endTime < nextStartTime
  ) {
    sets.push("end_time = ?");
    values.push(null);
  }

  if (patch.color !== undefined) {
    sets.push("color = ?");
    values.push(normalizeColor(patch.color));
  }
  if (patch.reminderMinutes !== undefined) {
    sets.push("reminder_minutes = ?");
    values.push(normalizeReminderMinutes(patch.reminderMinutes));
  }
  if (patch.memo !== undefined) {
    sets.push("memo = ?");
    values.push(typeof patch.memo === "string" ? patch.memo.trim() : "");
  }
  // 연차 여부를 끄면 일수도 같이 지운다. 안 그러면 연차가 아닌 일정에 숫자만 남는다
  // (하루 종일로 바꿀 때 종료 시각을 지우는 것과 같은 이유).
  const nextIsLeave = patch.isLeave !== undefined ? Boolean(patch.isLeave) : current.isLeave;
  if (patch.isLeave !== undefined) {
    sets.push("is_leave = ?");
    values.push(nextIsLeave ? 1 : 0);
  }
  if (patch.isLeave !== undefined || patch.leaveDays !== undefined) {
    const raw = patch.leaveDays !== undefined ? patch.leaveDays : current.leaveDays;
    sets.push("leave_days = ?");
    values.push(nextIsLeave ? normalizeLeaveDays(raw) : null);
  }
  if (patch.isLeave !== undefined || patch.leaveTypeId !== undefined) {
    const raw = patch.leaveTypeId !== undefined ? patch.leaveTypeId : current.leaveTypeId;
    sets.push("leave_type_id = ?");
    values.push(nextIsLeave && raw ? Number(raw) : null);
  }
  if (patch.done !== undefined) {
    sets.push("done = ?");
    values.push(patch.done ? 1 : 0);
  }

  if (sets.length === 0) throw new ValidationError("변경할 항목이 없습니다.");

  values.push(id);
  await run(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`, values);
  return getEvent(id);
}

export async function deleteEvent(id: number): Promise<boolean> {
  const { rowsAffected } = await run(`DELETE FROM events WHERE id = ?`, [id]);
  return rowsAffected > 0;
}

/**
 * 그 기간에 **연차를 낼 수 없는** 날짜들.
 *
 * 징검다리 추천에서 "이 날은 연차를 못 쓴다"는 제약으로 쓴다.
 * 무엇이 연차를 막는지가 이 함수의 전부라, 조건을 셋으로 좁혀 두었다.
 *
 * 1. **완료한 일정은 안 막는다** — 이미 끝난 일이다.
 * 2. **시각이 있는 일정은 안 막는다** — 10~11시 회의 하나 때문에 그 날 연차를 못 낼 이유가 없다.
 *    옮기거나 빠지면 그만이다. 하루를 통째로 잡아먹는 일정은 '하루 종일'로 들어온다.
 * 3. **반복 일정은 안 막는다** — 매주 회의를 등록하면 60주치 월요일이 전부 막혀
 *    월요일이 필요한 연휴 추천이 통째로 사라진다. 실제로 재 보니 추천이 86건에서
 *    56건으로 줄었다. 주간 회의 때문에 연차를 못 낸다는 건 사실이 아니다.
 *
 * 남는 것은 "단발로 잡힌 하루 종일 일정" — 출장·경조사처럼 정말 그 날을 못 비우는 것들이다.
 */
export async function busyDates(from: DateStr, to: DateStr): Promise<DateStr[]> {
  const rows = await all<{ date: DateStr; end_date: DateStr }>(
    `SELECT date, end_date FROM events
     WHERE done = 0
       AND start_time IS NULL
       AND series_id = ''
       AND date <= ? AND end_date >= ?`,
    [to, from],
  );

  // 여러 날짜에 걸친 일정은 그 사이 날이 전부 막힌다
  const out = new Set<DateStr>();
  for (const r of rows) {
    const start = r.date > from ? r.date : from;
    const end = (r.end_date || r.date) < to ? r.end_date || r.date : to;
    for (const d of eachDay(start, end)) out.add(d);
  }

  return [...out].sort();
}

/**
 * 제목·메모로 찾는다. 대소문자와 상관없이, 부분 일치로.
 *
 * 지금까지 일정에 도달하는 길은 달력 셀과 두 목록뿐이었다. 몇 달 전 일정을 찾으려면
 * 달을 하나씩 넘겨야 했다.
 */
export type SearchResult = {
  events: Event[];
  /** 결과가 limit에서 잘렸는가. 정확한 전체 건수는 세지 않는다 (아래 참고) */
  hasMore: boolean;
};

export async function searchEvents(query: string, limit = 30): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { events: [], hasMore: false };

  // LIKE의 와일드카드(%, _)와 이스케이프 문자를 검색어에서 무력화한다
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  // limit보다 **한 행 더** 가져온다. 그 한 행이 있는지가 곧 "더 있다"다.
  //
  // COUNT(*)로 정확한 전체 건수를 세지 않는 이유: 이 WHERE는 LIKE '%…%'라 인덱스를
  // 탈 수 없어서 COUNT는 매번 events 전량 스캔이 된다. 반면 지금 이 쿼리는
  // idx_events_date를 역주행하며 필요한 행만 채우고 조기 종료한다.
  // 5만 행에서 실측: LIMIT 31이 1.26ms, 같은 조건의 COUNT(*)가 5.08ms.
  // 정확한 숫자를 보여 주려고 매 검색을 전량 스캔으로 바꾸는 건 남는 장사가 아니다.
  const rows = await all<EventRow>(
    `${SELECT}
     WHERE title LIKE ? ESCAPE '\\' OR memo LIKE ? ESCAPE '\\'
     ORDER BY date DESC, e.id DESC
     LIMIT ?`,
    [like, like, limit + 1],
  );

  return {
    events: rows.slice(0, limit).map(toEvent),
    hasMore: rows.length > limit,
  };
}

/* ── 시간 겹침 ───────────────────────────────────────────────────────── */

/** 시각이 있는 일정이 차지하는 구간(분). 종료 시각이 없으면 길이 0인 '시점'이다. */
type Span = { id: number; from: number; to: number };

function spanOf(e: Event): Span | null {
  const from = minutesOf(e.startTime);
  if (from === null) return null; // 하루 종일 — 시간 칸을 차지하지 않는다
  const to = minutesOf(e.endTime);
  return { id: e.id, from, to: to !== null && to > from ? to : from };
}

/**
 * 두 구간이 겹치는가.
 *
 * 끝과 시작이 맞닿는 건(10:00~11:00과 11:00~12:00) 겹침이 아니다 — 연달아 잡은 일정이라
 * 경고할 일이 아니다. 그래서 반열림 구간 `[from, to)`으로 본다.
 * 종료 시각이 없는 '시점'끼리는 길이가 0이라 이 식으로 잡히지 않으므로 같은 시각인지 따로 본다.
 */
function overlaps(a: Span, b: Span): boolean {
  if (a.from === b.from) return true; // 시점끼리 포함
  return a.from < b.to && b.from < a.to;
}

/**
 * **같은 날에 놓인** 일정들 중 시각이 서로 겹치는 것들의 id.
 *
 * DB를 다시 읽지 않는다 — 화면이 이미 그 날 일정을 통째로 들고 있어서 그 배열만 훑으면 된다.
 * 그래서 인자로 받은 일정들이 하루를 공유한다고 **가정**한다 (listEventsByDate의 결과).
 *
 * 하루 종일 일정은 시간 칸을 차지하지 않으므로 대상이 아니고,
 * 완료 표시한 일정도 뺀다 — 이미 지나간 일이라 지금 와서 조정할 것이 없다.
 */
export function timeConflictIds(events: Event[]): number[] {
  const spans = events.filter((e) => !e.done).map(spanOf).filter((s): s is Span => s !== null);

  const hit = new Set<number>();
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (overlaps(spans[i], spans[j])) {
        hit.add(spans[i].id);
        hit.add(spans[j].id);
      }
    }
  }
  return [...hit];
}
