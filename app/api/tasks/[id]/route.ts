import { NextResponse } from "next/server";
import { deleteTask, setTaskDone } from "@/lib/tasks";

/** 준비물 한 건 — 완료 토글 / 삭제 */

type Ctx = { params: Promise<{ id: string }> };

async function taskId(ctx: Ctx): Promise<number | null> {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  const id = await taskId(ctx);
  if (id === null) return NextResponse.json({ error: "잘못된 id입니다." }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "done은 true/false여야 합니다." }, { status: 400 });
  }

  const task = setTaskDone(id, body.done);
  if (!task) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const id = await taskId(ctx);
  if (id === null) return NextResponse.json({ error: "잘못된 id입니다." }, { status: 400 });

  if (!deleteTask(id)) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
