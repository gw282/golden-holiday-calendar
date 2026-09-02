import { NextResponse } from "next/server";
import { chooseCalendar, connection, disconnect, listCalendars, GoogleError } from "@/lib/google";

/**
 * 구글 캘린더 연결 상태.
 *
 * GET    → 연결 여부 · 계정 · 고른 캘린더. `?calendars=1`이면 고를 수 있는 목록도 같이.
 * PATCH  → 동기화할 캘린더 고르기
 * DELETE → 연결 해제 (구글 쪽 동의 취소 + 받아 온 일정 정리)
 *
 * 동의 화면으로 보내는 것과 돌아오는 것은 `/api/google/auth`·`/callback`이 맡는다 —
 * 그쪽은 JSON이 아니라 **리디렉션**이라 성격이 다르다.
 */

export async function GET(request: Request) {
  const conn = connection();
  const wantList = new URL(request.url).searchParams.get("calendars") === "1";

  if (!wantList || !conn.connected) return NextResponse.json({ ...conn, calendars: [] });

  try {
    return NextResponse.json({ ...conn, calendars: await listCalendars() });
  } catch (e) {
    // 목록을 못 받아도 연결 상태 자체는 돌려준다. 화면이 통째로 비면
    // '연결 해제'조차 누를 수 없어 빠져나갈 길이 없어진다.
    return NextResponse.json({
      ...conn,
      calendars: [],
      error: e instanceof GoogleError ? e.message : "캘린더 목록을 받지 못했습니다.",
    });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; name?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "캘린더를 골라 주세요." }, { status: 400 });

  if (!connection().connected) {
    return NextResponse.json({ error: "먼저 구글 계정을 연결해 주세요." }, { status: 409 });
  }

  chooseCalendar(id, typeof body.name === "string" ? body.name : "");
  return NextResponse.json(connection());
}

export async function DELETE() {
  const removed = await disconnect();
  return NextResponse.json({ ok: true, removed });
}
