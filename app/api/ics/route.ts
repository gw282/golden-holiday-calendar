import { NextResponse } from "next/server";
import { listEvents } from "@/lib/events";
import { toIcs } from "@/lib/ics";
import { today } from "@/lib/date";
import { checkpoint } from "@/lib/db";

/**
 * `.ics` 내보내기 / 가져오기.
 *
 * GET  → 등록된 일정 전체를 iCalendar 파일로. 공휴일은 넣지 않는다 —
 *        규칙으로 만들어 내는 값이라 백업할 데이터가 아니고, 남의 캘린더에 넣으면
 *        그쪽 공휴일과 겹쳐 두 번 보인다.
 * 가져오기는 /api/ics/preview → /api/ics/apply 두 단계로 나가 있다.
 */

export async function GET() {
  // 내보내기 = 백업이다. WAL에만 있는 최근 쓰기를 먼저 본체로 밀어 넣어,
  // 사용자가 data/ 폴더를 같이 복사해도 어긋나지 않게 한다.
  checkpoint();
  const ics = toIcs(listEvents());

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="golden-holiday-${today()}.ics"`,
      // 브라우저가 예전 파일을 물고 있으면 백업이 아니라 사고가 된다
      "Cache-Control": "no-store",
    },
  });
}

/*
 * POST는 여기 없다. 예전에는 이 자리에서 파일을 받아 **곧바로** 넣었는데,
 * 무엇이 들어올지 미리 볼 수도 되돌릴 수도 없어서 두 단계로 갈랐다.
 *   /api/ics/preview  — 읽어만 보고 상태를 붙여 돌려준다 (저장 안 함)
 *   /api/ics/apply    — 확정한 대로 넣고, 되돌릴 번호를 준다
 * 바로 넣는 길을 남겨 두면 결국 그쪽으로 쓰게 되어 미리보기를 둔 뜻이 없어진다.
 */
