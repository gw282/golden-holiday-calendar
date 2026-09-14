import { run } from "./db";
import { holidayMap } from "./calendar";
import { createEvent, eventExists, repeatDates, ValidationError, type RepeatFreq } from "./events";
import { MAX_IMPORT, parseIcs, type RepeatHint } from "./ics";
import { isValidDateStr, type DateStr } from "./date";

/**
 * `.ics` 가져오기 — **미리보기와 확정을 나눈다.**
 *
 * 예전에는 파일을 고르는 순간 최대 500건이 그대로 들어갔다. 셋이 문제였다:
 * 무엇이 들어올지 미리 볼 수 없고, 되돌릴 수 없고, 반복 일정이 첫 회차만 들어왔다.
 *
 * 그래서 이 파일이 하는 일은 셋이다.
 * 1. **미리보기** — 넣기 전에 한 건씩 상태를 붙여 보여 준다
 * 2. **묶음 번호** — 한 번에 들어온 것에 같은 번호를 달아 통째로 되돌린다
 * 3. **공휴일 걸러내기** — 구글 캘린더에는 대개 「대한민국 공휴일」이 구독돼 있어
 *    그대로 넣으면 이 앱이 이미 아는 공휴일이 한 번 더 찍힌다
 */

export type ItemStatus =
  /** 새로 들어올 것 */
  | "new"
  /** 제목·날짜·시각이 같은 일정이 이미 있다 */
  | "duplicate"
  /** 같은 날 같은 이름의 공휴일을 이 앱이 이미 안다 */
  | "holiday";

export type PreviewItem = {
  /** 파일에서 몇 번째로 읽힌 것인지. 확정할 때 이 번호로 지목한다 */
  index: number;
  title: string;
  date: DateStr;
  endDate: DateStr;
  startTime: string | null;
  endTime: string | null;
  status: ItemStatus;
  /** RRULE에서 읽은 반복. 화면에서 고칠 수 있다 */
  repeat: RepeatHint | null;
  /** 못 다루는 반복 주기(매일 등)면 그 이름 */
  unsupportedRepeat: string | null;
};

export type PreviewResult = {
  items: PreviewItem[];
  /** 날짜를 못 읽어 아예 목록에도 못 오른 수 */
  unreadable: number;
  /** 한 번에 받을 수 있는 상한을 넘겼는가 */
  tooMany: boolean;
};

/** 확정할 때 화면이 되돌려 주는 항목별 지시 */
export type Override = {
  /** 넣지 않기 */
  skip?: boolean;
  /**
   * 반복을 이렇게 만들어라. null이면 반복 없이 한 건만.
   * `until`은 "가져올 기간" 끝날짜가 정해져 있을 때만 쓴다 — 반복 횟수(count)를
   * 그대로 두면 필터로 고른 기간을 넘어 한참 뒤까지 계속 생겨 필터를 무시한
   * 것처럼 보인다(아래 `applyIcs`의 기간 클램프 참고).
   */
  repeat?: { freq: RepeatFreq; count: number } | { freq: RepeatFreq; until: DateStr } | null;
};

export class ImportError extends Error {}

// ── 미리보기 ─────────────────────────────────────────────

export async function previewIcs(text: string): Promise<PreviewResult> {
  const { items, skipped } = parseIcs(text);

  // 공휴일은 한 번만 읽어 온다. 건마다 물으면 파일 건수만큼 질의가 나간다
  const dates = items.map((i) => i.input.date).sort();
  const holidays =
    dates.length > 0 ? await holidayMap(dates[0], dates[dates.length - 1]) : new Map();

  // 건마다 DB에 중복을 물어야 해서 Promise.all로 묶는다. 순서대로 await하면
  // 원격에서는 파일 건수만큼 왕복이 직렬로 쌓인다.
  const out: PreviewItem[] = await Promise.all(
    items.map(async (item, index) => {
      const e = item.input;
      const endDate = e.endDate ?? e.date;
      return {
        index,
        title: e.title,
        date: e.date,
        endDate,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        status: await statusOf(e.title, e.date, endDate, e.startTime ?? null, holidays),
        repeat: item.repeat,
        unsupportedRepeat: item.unsupportedRepeat,
      };
    }),
  );

  return { items: out, unreadable: skipped, tooMany: items.length > MAX_IMPORT };
}

/**
 * 이 한 건이 어떤 상태인가.
 *
 * 공휴일 판정은 **하루짜리 하루 종일 일정**에만 건다. 시각이 붙어 있으면 그 날 잡힌
 * 약속이지 공휴일이 아니고, 여러 날에 걸친 것은 연휴를 낀 휴가일 수 있다.
 * 이름은 서로 **포함 관계**면 같은 것으로 본다 — 이 앱은 `추석 연휴`라 부르고
 * 구글은 `추석`이라 불러서, 글자가 똑같기를 기다리면 한 건도 안 걸린다.
 */
async function statusOf(
  title: string,
  date: DateStr,
  endDate: DateStr,
  startTime: string | null,
  holidays: Map<DateStr, { name: string }>,
): Promise<ItemStatus> {
  if (startTime === null && endDate === date) {
    const h = holidays.get(date);
    if (h) {
      const a = h.name.replace(/\s/g, "");
      const b = title.replace(/\s/g, "");
      if (a && b && (a.includes(b) || b.includes(a))) return "holiday";
    }
  }
  if (await eventExists({ title, date, endDate, startTime })) return "duplicate";
  return "new";
}

// ── 확정 ─────────────────────────────────────────────────

export type ApplyResult = {
  /** 되돌릴 때 쓸 번호. 한 건도 안 들어갔으면 null */
  batchId: number | null;
  added: number;
  /** 사람이 체크를 풀어서 뺀 수 */
  skipped: number;
  /** 만들다 실패한 수 */
  failed: number;
};

/**
 * 미리보기에서 본 그 파일을 실제로 넣는다.
 *
 * 화면이 일정 내용을 통째로 되돌려 보내지 않고 **파일 원문과 지시만** 보낸다.
 * 서버가 다시 파싱하므로 미리보기에서 본 것과 넣는 것이 어긋날 수 없고,
 * 브라우저가 보낸 값을 그대로 믿지 않아도 된다.
 */
export async function applyIcs(
  text: string,
  overrides: Record<number, Override>,
): Promise<ApplyResult> {
  const { items } = parseIcs(text);
  if (items.length > MAX_IMPORT) {
    throw new ImportError(`한 번에 ${MAX_IMPORT}건까지만 넣을 수 있습니다. (${items.length}건)`);
  }

  const { lastInsertRowid } = await run(
    `INSERT INTO import_batches (label, added) VALUES (?, 0)`,
    [`.ics 가져오기`],
  );
  const batchId = lastInsertRowid;

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += 1) {
    const o = overrides[i] ?? {};
    if (o.skip) {
      skipped += 1;
      continue;
    }
    try {
      // 반복은 **화면에서 확정한 값**만 쓴다. 파일의 RRULE을 몰래 적용하지 않는다 —
      // 미리보기에서 본 것과 다른 결과가 나오면 미리보기를 둔 뜻이 없다.
      const repeat = normalizeRepeat(o.repeat);
      await createEvent({ ...items[i].input, repeat, importBatchId: batchId });
      // 반복이면 행이 여러 개 만들어진다. 화면에 "12건 넣었습니다"라고 적어야 하므로
      // 파일의 항목 수가 아니라 실제로 생긴 행 수를 센다. until 모드는 count가 없어서
      // createEvent와 똑같은 함수로 다시 날짜를 펼쳐 실제 회차 수를 구한다.
      added += repeat
        ? repeatDates(
            items[i].input.date,
            repeat.freq,
            "until" in repeat ? { until: repeat.until } : { count: repeat.count },
          ).length
        : 1;
    } catch (e) {
      if (e instanceof ValidationError) failed += 1;
      else throw e;
    }
  }

  if (added === 0) {
    // 한 건도 안 들어갔으면 되돌릴 것도 없다. 빈 묶음을 남기지 않는다
    await run(`DELETE FROM import_batches WHERE id = ?`, [batchId]);
    return { batchId: null, added: 0, skipped, failed };
  }

  await run(`UPDATE import_batches SET added = ? WHERE id = ?`, [added, batchId]);
  return { batchId, added, skipped, failed };
}

/** 화면이 보낸 반복 값을 믿을 수 있는 범위로 자른다 */
function normalizeRepeat(
  v: Override["repeat"],
): { freq: RepeatFreq; count: number } | { freq: RepeatFreq; until: DateStr } | null {
  if (!v) return null;
  if (!["weekly", "monthly", "yearly"].includes(v.freq)) return null;
  if ("until" in v) {
    return isValidDateStr(v.until) ? { freq: v.freq, until: v.until } : null;
  }
  const count = Math.round(Number(v.count));
  if (!Number.isFinite(count) || count < 2) return null;
  return { freq: v.freq, count };
}

// ── 되돌리기 ─────────────────────────────────────────────

/**
 * 한 묶음을 통째로 지운다.
 *
 * 가져온 뒤 사람이 고쳐 놓았어도 지운다. 되돌리기는 "가져오기 전으로"라는 뜻이고,
 * 무엇을 남길지 하나씩 묻기 시작하면 되돌리기가 아니라 또 다른 목록 작업이 된다.
 */
export async function undoBatch(id: number): Promise<number> {
  const { rowsAffected } = await run(`DELETE FROM events WHERE import_batch_id = ?`, [id]);
  await run(`DELETE FROM import_batches WHERE id = ?`, [id]);
  return rowsAffected;
}
