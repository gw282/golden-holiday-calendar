import { getDb } from "./db";
import { LEAVE_STEP, ValidationError } from "./events";
import { listHolidays } from "./calendar";
import { addDays, eachDay, isValidDateStr, isWeekend, today, type DateStr } from "./date";

/**
 * 휴가 잔고 — **연도가 아니라 주기(period)로 센다.**
 *
 * 회사마다 주기가 다른 휴가가 여러 개 돈다. 연차는 입사일 기준으로 1년씩 굴러가고,
 * 특별휴가는 달력해로 끊겨 연말에 소멸한다. "2026년 연차"라는 말은 입사일이 3/15인
 * 사람에게는 아예 성립하지 않으므로, 모든 계산의 단위를 주기로 바꿨다.
 *
 * **지급 일수는 사람이 넣는다.** 근속연수·회계연도·5인 미만 예외까지 코드로 옮기면
 * 앱의 절반이 노무 로직이 되고, 그건 이 앱이 하려는 일이 아니다.
 * **쓴 일수는 저장하지 않는다** — `events`를 합산하면 나오는 값이라 따로 두면 어긋난다.
 */

/** 한 주기에 줄 수 있는 최대 일수. 위쪽만 실수 방지로 잘라 둔다 */
const MAX_TOTAL_DAYS = 365;

export type LeaveCycle = "calendar" | "anniversary";

export type LeaveType = {
  id: number;
  name: string;
  cycle: LeaveCycle;
  /** 입사일. `anniversary`일 때만 뜻이 있다. 아직 안 넣었으면 null */
  anchorDate: DateStr | null;
  /** 쪼갤 수 있는 최소 단위 — 연차 0.25(반반차), 특별휴가 1(하루) */
  minUnit: number;
  /** 남은 것이 다음 주기로 넘어가는지. false면 소멸 */
  carryOver: boolean;
  sortOrder: number;
};

export type LeavePeriod = { start: DateStr; end: DateStr };

export type LeaveSummary = {
  type: LeaveType;
  period: LeavePeriod;
  /** 그 주기에 받은 일수. 아직 안 넣었으면 null */
  total: number | null;
  used: number;
  remaining: number | null;
  /** 소멸까지 남은 날수. 오늘이 마지막 날이면 0 */
  daysLeft: number;
};

/* ── 주기 계산 ───────────────────────────────────────────────────────── */

/**
 * 그 날이 속한 주기.
 *
 * `anniversary`인데 입사일을 아직 안 넣었으면 달력해로 돌린다 — 설정을 안 했다고
 * 화면이 비거나 터지면 안 되고, 입사일을 넣는 순간 자연히 제자리를 찾는다.
 */
export function periodOf(type: LeaveType, on: DateStr): LeavePeriod {
  const year = Number(on.slice(0, 4));

  if (type.cycle !== "anniversary" || !type.anchorDate) {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }

  // 입사일의 월·일이 주기의 경계다. 올해 기념일이 아직 안 왔으면 작년 기념일에 시작한 주기다.
  const md = type.anchorDate.slice(5); // 'MM-DD'
  const thisYearAnchor = `${year}-${md}`;
  const start = on >= thisYearAnchor ? thisYearAnchor : `${year - 1}-${md}`;

  // 다음 기념일 하루 전까지. 2/29 입사자는 평년에 3/1로 밀리는데, 그 경우도
  // '다음 기념일의 전날'이라는 정의가 그대로 성립한다.
  const nextAnchor = `${Number(start.slice(0, 4)) + 1}-${md}`;
  return { start, end: addDays(nextAnchor, -1) };
}

/* ── 종류 ────────────────────────────────────────────────────────────── */

type TypeRow = {
  id: number;
  name: string;
  cycle: string;
  anchor_date: string | null;
  min_unit: number;
  carry_over: number;
  sort_order: number;
};

function toType(r: TypeRow): LeaveType {
  return {
    id: r.id,
    name: r.name,
    cycle: r.cycle === "anniversary" ? "anniversary" : "calendar",
    anchorDate: r.anchor_date || null,
    minUnit: Number(r.min_unit),
    carryOver: Boolean(r.carry_over),
    sortOrder: r.sort_order,
  };
}

export function listLeaveTypes(): LeaveType[] {
  const rows = getDb()
    .prepare(`SELECT * FROM leave_types ORDER BY sort_order, id`)
    .all() as unknown as TypeRow[];
  return rows.map(toType);
}

export function getLeaveType(id: number): LeaveType | null {
  const row = getDb().prepare(`SELECT * FROM leave_types WHERE id = ?`).get(id) as
    | unknown as TypeRow
    | undefined;
  return row ? toType(row) : null;
}

/** 종류를 못 찾았을 때 기댈 기본값 (정렬 첫 번째 = 연차) */
export function defaultLeaveType(): LeaveType | null {
  return listLeaveTypes()[0] ?? null;
}

/** 입사일·이름 등 설정을 고친다. 넘긴 것만 바꾼다. */
export function updateLeaveType(
  id: number,
  patch: { anchorDate?: DateStr | null; name?: string },
): LeaveType | null {
  const sets: string[] = [];
  const values: Array<string | null> = [];

  if (patch.anchorDate !== undefined) {
    if (patch.anchorDate !== null && !isValidDateStr(patch.anchorDate)) {
      throw new ValidationError("입사일은 'YYYY-MM-DD' 형식이어야 합니다.");
    }
    sets.push("anchor_date = ?");
    values.push(patch.anchorDate);
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new ValidationError("휴가 이름은 비울 수 없습니다.");
    sets.push("name = ?");
    values.push(name);
  }
  if (sets.length === 0) throw new ValidationError("변경할 항목이 없습니다.");

  const before = getLeaveType(id);
  getDb()
    .prepare(`UPDATE leave_types SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values, id);
  const after = getLeaveType(id);

  // 입사일이 바뀌면 주기 경계가 통째로 움직인다. 그대로 두면 이미 넣어 둔 지급 일수가
  // 옛 주기 시작일에 묶여 **화면에서 사라진다** — 사용자는 숫자가 날아갔다고 느낀다.
  // 그래서 옛 지급을 새 주기로 옮겨 준다.
  if (after && before && patch.anchorDate !== undefined && before.anchorDate !== after.anchorDate) {
    remapGrants(before, after);
  }
  return after;
}

/**
 * 주기 경계가 바뀌었을 때 지급 일수를 새 주기로 옮긴다.
 *
 * **옛 주기 안의 어느 날을 기준으로 옮길지**가 관건이다. 옛 주기의 시작일을 그대로 쓰면
 * 한 주기 어긋난다 — 달력해(1/1~12/31)에서 3/15 기준으로 바뀌면 1/1이 들어가는 새 주기는
 * **작년** 것이라, 사용자가 올해 넣은 숫자가 작년 칸으로 사라진다.
 *
 * 그래서 옛 주기가 오늘을 품고 있으면 **오늘**을 기준으로 옮긴다. 사용자가 방금 넣은
 * 그 숫자는 "지금 쓰고 있는 휴가"를 뜻하기 때문이다. 오늘을 안 품는 옛 주기(과거·미래)는
 * 시작일 기준 그대로 둔다.
 */
function remapGrants(before: LeaveType, after: LeaveType): void {
  const db = getDb();
  const rows = db
    .prepare(`SELECT period_start, total_days FROM leave_grants WHERE type_id = ? ORDER BY period_start`)
    .all(before.id) as unknown as Array<{ period_start: DateStr; total_days: number }>;
  if (rows.length === 0) return;

  const t = today();

  db.prepare(`DELETE FROM leave_grants WHERE type_id = ?`).run(before.id);
  const insert = db.prepare(
    `INSERT INTO leave_grants (type_id, period_start, total_days) VALUES (?, ?, ?)
     ON CONFLICT(type_id, period_start) DO UPDATE SET total_days = excluded.total_days`,
  );

  for (const r of rows) {
    const old = periodOf(before, r.period_start);
    const basis = t >= old.start && t <= old.end ? t : r.period_start;
    insert.run(after.id, periodOf(after, basis).start, r.total_days);
  }
}


/* ── 지급 일수 ───────────────────────────────────────────────────────── */

export function getGrant(typeId: number, periodStart: DateStr): number | null {
  const row = getDb()
    .prepare(`SELECT total_days FROM leave_grants WHERE type_id = ? AND period_start = ?`)
    .get(typeId, periodStart) as unknown as { total_days: number } | undefined;
  return row ? Number(row.total_days) : null;
}

/** 그 주기에 받은 일수를 넣거나 고친다. null이면 설정 자체를 지운다. */
export function setGrant(typeId: number, periodStart: DateStr, total: number | null): void {
  const type = getLeaveType(typeId);
  if (!type) throw new ValidationError("휴가 종류를 찾을 수 없습니다.");
  if (!isValidDateStr(periodStart)) throw new ValidationError("주기 시작일이 올바르지 않습니다.");

  const db = getDb();
  if (total === null) {
    db.prepare(`DELETE FROM leave_grants WHERE type_id = ? AND period_start = ?`).run(
      typeId,
      periodStart,
    );
    return;
  }

  const n = Number(total);
  if (!Number.isFinite(n) || n < 0 || n > MAX_TOTAL_DAYS) {
    throw new ValidationError(`총 일수는 0~${MAX_TOTAL_DAYS}일 사이여야 합니다.`);
  }
  // 하루 단위 휴가에 0.5를 넣으면 쓸 수 없는 잔고가 생긴다. 지급도 같은 단위로 막는다.
  if (!Number.isInteger(n / type.minUnit)) {
    throw new ValidationError(`${type.name}${topicParticle(type.name)} ${type.minUnit}일 단위로 넣어 주세요.`);
  }

  db.prepare(
    `INSERT INTO leave_grants (type_id, period_start, total_days) VALUES (?, ?, ?)
     ON CONFLICT(type_id, period_start) DO UPDATE SET total_days = excluded.total_days`,
  ).run(typeId, periodStart, n);
}

/* ── 사용량 ──────────────────────────────────────────────────────────── */

/**
 * 그 구간에서 실제로 내야 하는 날수 — **주말과 공휴일은 뺀다.**
 * 금요일부터 월요일까지 쉬어도 연차는 이틀이다.
 */
export function autoLeaveDays(from: DateStr, to: DateStr, holidays: Set<DateStr>): number {
  let n = 0;
  for (const d of eachDay(from, to)) {
    if (!isWeekend(d) && !holidays.has(d)) n++;
  }
  return n;
}

/**
 * 한 주기 동안 쓴 일수.
 *
 * **주기 시작일이 그 주기 안에 있는 일정만** 센다. 연말에 걸친 휴가를 날짜별로 쪼개
 * 두 주기에 나눠 다는 건 회사 규정마다 달라, 임의로 정하면 오히려 틀린 숫자가 된다.
 */
export function usedInPeriod(typeId: number, period: LeavePeriod, isDefault: boolean): number {
  // leave_type_id가 비어 있는 옛 데이터는 기본 종류(연차)의 것으로 본다
  const where = isDefault
    ? `(leave_type_id = ? OR leave_type_id IS NULL)`
    : `leave_type_id = ?`;

  const rows = getDb()
    .prepare(
      `SELECT date, end_date, leave_days FROM events
       WHERE is_leave = 1 AND ${where} AND date BETWEEN ? AND ?`,
    )
    .all(typeId, period.start, period.end) as unknown as Array<{
    date: DateStr;
    end_date: DateStr;
    leave_days: number | null;
  }>;

  if (rows.length === 0) return 0;

  // 공휴일은 한 번만 읽는다. 일정이 주기 밖으로 이어질 수 있어 넉넉히 잡는다.
  const holidays = new Set(
    listHolidays(addDays(period.start, -40), addDays(period.end, 40)).map((h) => h.date),
  );

  let used = 0;
  for (const r of rows) {
    used +=
      r.leave_days === null || r.leave_days === undefined
        ? autoLeaveDays(r.date, r.end_date || r.date, holidays)
        : Number(r.leave_days);
  }
  // 0.25 단위를 더하면 부동소수점 찌꺼기가 남는다 (0.1+0.2 문제). 두 자리에서 끊는다.
  return Number(used.toFixed(2));
}

/* ── 요약 ────────────────────────────────────────────────────────────── */

export function summarize(type: LeaveType, on: DateStr = today()): LeaveSummary {
  const period = periodOf(type, on);
  const total = getGrant(type.id, period.start);
  const used = usedInPeriod(type.id, period, type.sortOrder === 0);

  // 소멸까지 남은 날. eachDay를 쓰지 않고 문자열 비교로 끝낸다 (주기가 1년이라 366칸이 될 수 있다)
  const daysLeft = Math.max(
    0,
    Math.round(
      (Date.parse(period.end + "T00:00:00Z") - Date.parse(on + "T00:00:00Z")) / 86_400_000,
    ),
  );

  return {
    type,
    period,
    total,
    used,
    remaining: total === null ? null : Number((total - used).toFixed(2)),
    daysLeft,
  };
}

/** 모든 종류의 요약. 화면은 이걸로 헤더와 팝업을 함께 그린다. */
export function leaveSummaries(on: DateStr = today()): LeaveSummary[] {
  return listLeaveTypes().map((t) => summarize(t, on));
}

/**
 * 헤더에 띄울 하나 — **가장 급한 것**.
 *
 * 남은 일수가 있는 것 중 소멸이 가까운 순. 잔고를 아직 안 넣은 종류는 뒤로 민다
 * (숫자가 없으면 급할 것도 없다). 아무것도 없으면 첫 번째를 준다.
 */
export function mostUrgent(summaries: LeaveSummary[]): LeaveSummary | null {
  if (summaries.length === 0) return null;

  const pending = summaries.filter((s) => s.remaining !== null && s.remaining > 0);
  if (pending.length === 0) return summaries[0];

  return pending.reduce((a, b) => (a.daysLeft <= b.daysLeft ? a : b));
}

export { LEAVE_STEP };

/**
 * 한국어 조사 '은/는'을 고른다.
 *
 * 이름을 사용자가 고칠 수 있어서(휴가 종류 이름은 수정 가능) 문구를 하드코딩할 수 없다.
 * 마지막 글자에 받침이 있으면 '은', 없으면 '는'. 한글 음절은 0xAC00부터 28개씩
 * 종성이 도는 규칙이라 나머지 연산 하나로 판별된다.
 */
function topicParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "는";
  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}
