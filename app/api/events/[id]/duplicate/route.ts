import { NextResponse } from "next/server";
import { createEvent, getEvent, ValidationError } from "@/lib/events";
import { addDays, diffDays, isValidDateStr } from "@/lib/date";

// Next 16: 동적 세그먼트의 params는 Promise다.
type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * POST /api/events/:id/duplicate — 달력 드래그(Ctrl+드롭) 전용 복사.
 *
 * 원본을 건드리지 않고 `date`(놓은 칸)에 새 일정을 하나 만든다. 기간(며칠짜리인지)은
 * 원본 그대로 유지한다 — 3일짜리 일정을 복사하면 복사본도 3일짜리다.
 *
 * `seriesId`는 일부러 넘기지 않는다. 복사본을 반복 묶음에 끼워 넣으면 "반복 전체
 * 삭제"를 눌렀을 때 방금 복사한 것까지 같이 지워져 사용자가 예상 못 한 삭제가 된다.
 */
export async function POST(request: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "잘못된 id입니다." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { date?: unknown };
  if (typeof body.date !== "string" || !isValidDateStr(body.date)) {
    return NextResponse.json({ error: "date가 올바르지 않습니다." }, { status: 400 });
  }

  const original = await getEvent(id);
  if (!original) return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });

  const span = diffDays(original.date, original.endDate);

  try {
    const event = await createEvent({
      title: original.title,
      date: body.date,
      endDate: addDays(body.date, span),
      startTime: original.startTime,
      endTime: original.endTime,
      memo: original.memo,
      color: original.color || null,
      isLeave: original.isLeave,
      leaveTypeId: original.leaveTypeId,
      leaveDays: original.leaveDays,
      reminderMinutes: original.reminderMinutes,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
