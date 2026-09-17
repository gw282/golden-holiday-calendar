import { all, get, batch } from "./db";
import { today, type DateStr } from "./date";
import { FX_CURRENCIES } from "./currencies";

/**
 * 환율 — 원(KRW) 기준.
 *
 * 여행 준비 화면에서 "이 예산이 현지 돈으로 얼마인가"를 답하는 데만 쓴다.
 * 실시간 시세가 아니라 **하루 한 번** 받아 캐시한다. 여행 예산을 가늠하는 데
 * 분 단위 시세는 필요 없고, 매 요청마다 남의 서버를 부르면 화면이 그 서버 사정에 묶인다.
 *
 * 공급처: open.er-api.com — **키가 필요 없고** 통화가 166종이다.
 * ECB 기반(frankfurter 등)은 베트남 동·태국 바트가 없어 정작 자주 가는 곳이 빠진다.
 */

const ENDPOINT = "https://open.er-api.com/v6/latest/KRW";

export type FxRate = {
  code: string;
  /** 1원이 이 통화로 얼마인가 (예: JPY 0.1165) */
  perKrw: number;
  /** 이 통화 1단위가 몇 원인가 (예: JPY 8.58). 화면에는 이쪽이 읽기 쉽다 */
  krwPerUnit: number;
};

export type FxSnapshot = {
  /** 이 값들을 받은 날 */
  date: DateStr;
  rates: FxRate[];
  /** 오늘 치가 아니라 예전에 받아 둔 값인지 (API가 안 될 때) */
  stale: boolean;
};

async function readRates(date: DateStr): Promise<FxRate[]> {
  const rows = await all<{ quote: string; rate: number }>(
    `SELECT quote, rate FROM fx_rates WHERE date = ? ORDER BY quote`,
    [date],
  );

  // 화면에 내놓기로 한 순서를 지킨다 (DB는 알파벳 순으로 준다)
  const byCode = new Map(rows.map((r) => [r.quote, Number(r.rate)]));
  return FX_CURRENCIES.flatMap(({ code }) => {
    const perKrw = byCode.get(code);
    return perKrw ? [{ code, perKrw, krwPerUnit: 1 / perKrw }] : [];
  });
}

/** 마지막으로 받아 둔 날짜. 한 번도 못 받았으면 null */
async function latestDate(): Promise<DateStr | null> {
  const row = await get<{ d: string | null }>(`SELECT MAX(date) AS d FROM fx_rates`);
  return row?.d ?? null;
}

// 통화 열 몇 개를 하나씩 await하면 원격에서 왕복이 그만큼 늘어난다. 한 번에 보낸다.
async function save(date: DateStr, rates: Record<string, number>) {
  const sql = `INSERT INTO fx_rates (date, quote, rate) VALUES (?, ?, ?)
               ON CONFLICT(date, quote) DO UPDATE SET rate = excluded.rate`;
  await batch(
    FX_CURRENCIES.flatMap(({ code }) => {
      const rate = rates[code];
      return typeof rate === "number" && rate > 0 ? [{ sql, args: [date, code, rate] }] : [];
    }),
  );
}

/**
 * 오늘 치가 없으면 받아 온다.
 *
 * 실패해도 던지지 않는다 — 환율은 이 앱의 곁가지라, 못 받았다고 여행 준비 화면 전체가
 * 500이 되면 안 된다. 그럴 때는 마지막으로 받아 둔 값을 `stale`로 표시해 보여 준다.
 */
export async function fxSnapshot(): Promise<FxSnapshot | null> {
  const t = today();

  // 통화를 새로 추가했으면 오늘 치가 있어도 **모자란** 상태다. 다 있을 때만 캐시로 인정한다 —
  // 개수만 보면 목록이 늘어난 날 새 통화가 하루 종일 빈칸으로 남는다.
  const cached = await readRates(t);
  if (cached.length === FX_CURRENCIES.length) return { date: t, rates: cached, stale: false };

  try {
    const res = await fetch(ENDPOINT, {
      // Next의 fetch 캐시를 끄고 우리 DB 캐시만 쓴다. 캐시가 두 겹이면 언제 갱신되는지 알 수 없다
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (data.result === "success" && data.rates) {
        await save(t, data.rates);
        const fresh = await readRates(t);
        if (fresh.length > 0) return { date: t, rates: fresh, stale: false };
      }
    }
  } catch {
    // 네트워크가 없거나 느린 경우. 아래에서 예전 값으로 넘어간다.
  }

  // 받아오지 못했지만 오늘 치가 일부라도 있으면 그걸 쓴다 (통화를 막 추가한 경우)
  if (cached.length > 0) return { date: t, rates: cached, stale: false };

  const last = await latestDate();
  if (!last) return null;

  const old = await readRates(last);
  return old.length > 0 ? { date: last, rates: old, stale: true } : null;
}
