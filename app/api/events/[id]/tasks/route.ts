import { NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/tasks";
import { ValidationError } from "@/lib/events";

/** 한 일정에 딸린 준비물 목록 / 추가 */

type Ctx = { params: Promise<{ id: string }> };

function eventId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, ctx: Ctx) {
  // Next 16에서 params는 Promise다
  const { id: raw } = await ctx.params;
  const id = eventId(raw);
  if (id === null) return NextResponse.json({ error: "잘못된 id입니다." }, { status: 400 });

  return NextResponse.json({ tasks: await listTasks(id) });
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = eventId(raw);
  if (id === null) return NextResponse.json({ error: "잘못된 id입니다." }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });

  try {
    return NextResponse.json({ task: await createTask(id, body.text) }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
