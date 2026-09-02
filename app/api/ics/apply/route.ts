import { NextResponse } from "next/server";
import { applyIcs, undoBatch, ImportError, type Override } from "@/lib/importIcs";

/**
 * POST   → 미리보기에서 확정한 대로 넣는다. 되돌릴 번호(`batchId`)를 돌려준다.
 * DELETE → `?batch=N` 묶음을 통째로 되돌린다.
 */

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    ics?: unknown;
    overrides?: unknown;
  };

  if (typeof body.ics !== "string" || !body.ics.includes("BEGIN:VEVENT")) {
    return NextResponse.json({ error: "일정이 들어 있는 .ics 내용이 아닙니다." }, { status: 400 });
  }

  const overrides =
    body.overrides && typeof body.overrides === "object"
      ? (body.overrides as Record<number, Override>)
      : {};

  try {
    return NextResponse.json(await applyIcs(body.ics, overrides));
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("batch"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "되돌릴 묶음 번호가 없습니다." }, { status: 400 });
  }
  return NextResponse.json({ removed: await undoBatch(id) });
}
