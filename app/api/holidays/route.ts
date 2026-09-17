import { NextResponse } from "next/server";
import { holidayCoverage, listHolidays } from "@/lib/calendar";

/**
 * GET /api/holidays — 시드된 공휴일 **날짜만** 전부.
 *
 * 일정 팝업이 "연차 며칠 쓰는지"를 자동으로 세려면 공휴일을 알아야 하는데,
 * 클라이언트 컴포넌트에서 lib/calendar를 import하면 @libsql/client가 번들로 끌려온다.
 * 그래서 이 얇은 라우트로 날짜 배열만 넘긴다 (5년치라야 100건 안쪽이다).
 */
export async function GET() {
  const coverage = await holidayCoverage();
  if (!coverage) return NextResponse.json({ dates: [] });

  return NextResponse.json({
    dates: (await listHolidays(coverage.from, coverage.to)).map((h) => h.date),
  });
}
