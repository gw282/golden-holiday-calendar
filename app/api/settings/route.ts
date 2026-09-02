import { NextResponse } from "next/server";
import { isOffline, setOffline } from "@/lib/settings";

/** GET → 현재 설정 / PATCH → 오프라인 모드 켜고 끄기 */

export function GET() {
  return NextResponse.json({ offline: isOffline() });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { offline?: unknown };
  if (typeof body.offline !== "boolean") {
    return NextResponse.json({ error: "offline은 true/false여야 합니다." }, { status: 400 });
  }
  setOffline(body.offline);
  return NextResponse.json({ offline: isOffline() });
}
