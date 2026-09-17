import { NextResponse } from "next/server";
import {
  deleteEvent,
  deleteSeries,
  getEvent,
  updateEvent,
  ValidationError,
  type UpdateInput,
} from "@/lib/events";

// Next 16: 동적 세그먼트의 params는 Promise다.
type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** PATCH /api/events/:id — 부분 수정 (완료 토글 포함) */
export async function PATCH(request: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "잘못된 id입니다." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  try {
    const event = await updateEvent(id, (body ?? {}) as UpdateInput);
    if (!event) return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ event });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

/** DELETE /api/events/:id */
export async function DELETE(request: Request, ctx: Ctx) {
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "잘못된 id입니다." }, { status: 400 });

  // ?series=1 이면 같은 반복 묶음을 통째로 지운다
  if (new URL(request.url).searchParams.get("series") === "1") {
    const event = await getEvent(id);
    if (!event) return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });

    const deleted = event.seriesId
      ? await deleteSeries(event.seriesId)
      : Number(await deleteEvent(id));
    return NextResponse.json({ ok: true, deleted });
  }

  if (!(await deleteEvent(id))) {
    return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted: 1 });
}
