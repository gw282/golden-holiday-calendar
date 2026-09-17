import { NextResponse } from "next/server";
import { connection, syncEvents, GoogleError } from "@/lib/google";

/**
 * 구글 → 이 앱으로 일정을 받아 온다.
 *
 * `?stale=1`이면 **마지막 동기화가 오래된 경우에만** 돈다. 화면이 열릴 때마다
 * 조용히 부르는 쪽이 쓰는 이 옵션이 없으면, 새로고침 한 번에 구글을 한 번씩 두드린다.
 */

/** 이보다 오래됐으면 다시 받아 온다 */
const STALE_MINUTES = 30;

export async function POST(request: Request) {
  const conn = await connection();
  if (!conn.connected) {
    return NextResponse.json({ error: "구글 캘린더가 연결되어 있지 않습니다." }, { status: 409 });
  }

  if (new URL(request.url).searchParams.get("stale") === "1" && !isStale(conn.lastSyncedAt)) {
    return NextResponse.json({ skipped: true, lastSyncedAt: conn.lastSyncedAt });
  }

  try {
    const result = await syncEvents();
    return NextResponse.json({ ...result, lastSyncedAt: (await connection()).lastSyncedAt });
  } catch (e) {
    // 구글이 답을 안 준다고 화면이 500이 되면 안 된다. 환율과 같은 원칙이다
    return NextResponse.json(
      { error: e instanceof GoogleError ? e.message : "동기화하지 못했습니다." },
      { status: 502 },
    );
  }
}

/** `last_synced_at`은 SQLite의 `datetime('now')` = UTC 'YYYY-MM-DD HH:MM:SS' */
function isStale(at: string | null): boolean {
  if (!at) return true;
  const ms = Date.parse(`${at.replace(" ", "T")}Z`);
  if (Number.isNaN(ms)) return true;
  return Date.now() - ms > STALE_MINUTES * 60_000;
}
