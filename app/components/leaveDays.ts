"use client";

import { useEffect, useState } from "react";
import { eachDay, isValidDateStr, isWeekend } from "@/lib/date";

/**
 * 연차 일수를 **클라이언트에서** 세는 데 필요한 것들.
 *
 * 서버(`lib/leave.ts`)와 같은 규칙으로 센다 — 기간에서 주말과 공휴일을 뺀다.
 * 규칙이 두 군데에 있는 이유: 잔고 합산은 서버가, 팝업·목록의 미리보기는 클라이언트가 해야 하는데
 * `lib/leave.ts`를 클라이언트에서 import하면 node:sqlite가 번들로 끌려온다.
 * **한쪽을 고치면 다른 쪽도 같이 고칠 것.**
 */

/**
 * 공휴일 날짜를 한 번만 받아 두는 캐시.
 * 팝업마다 따로 받으면 열 때마다 요청이 나간다. 공휴일은 시드 데이터라 보는 동안 바뀌지 않는다.
 */
let cached: Promise<Set<string>> | null = null;

export function holidayDates(): Promise<Set<string>> {
  cached ??= fetch("/api/holidays")
    .then((r) => (r.ok ? r.json() : { dates: [] }))
    .then((d: { dates?: string[] }) => new Set(d.dates ?? []))
    // 실패하면 빈 집합. 자동 계산이 주말만 빼게 되지만 화면이 멈추는 것보다 낫다.
    .catch(() => new Set<string>());
  return cached;
}

/** 아직 못 받았으면 null. 그동안은 주말만 뺀 값이 보였다가 제자리를 찾는다. */
export function useHolidayDates(): Set<string> | null {
  const [holidays, setHolidays] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    holidayDates().then((h) => {
      if (alive) setHolidays(h);
    });
    return () => {
      alive = false;
    };
  }, []);

  return holidays;
}

/** 기간에서 주말과 공휴일을 뺀 날수 = 실제로 내야 하는 연차 */
export function countWorkdays(from: string, to: string, holidays: Set<string> | null): number {
  if (!isValidDateStr(from) || !isValidDateStr(to) || to < from) return 0;

  let n = 0;
  for (const d of eachDay(from, to)) {
    if (!isWeekend(d) && !holidays?.has(d)) n++;
  }
  return n;
}

/** 3 -> '3', 0.5 -> '0.5' — 반차·반반차를 쓸 때만 소수점이 붙는다 */
export function fmtDays(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * 일정 팝업이 고를 수 있는 휴가 종류.
 *
 * 서버(`lib/leave.ts`)의 `LeaveType` 전부가 아니라 **고르는 데 필요한 것만** 담는다 —
 * 팝업은 클라이언트 컴포넌트라 lib/leave를 import하면 node:sqlite가 번들로 끌려온다.
 */
export type LeaveTypeOption = {
  id: number;
  name: string;
  /** 쪼갤 수 있는 최소 단위. 1이면 반차를 못 쓴다 */
  minUnit: number;
};
