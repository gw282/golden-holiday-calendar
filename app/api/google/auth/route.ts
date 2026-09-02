import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authUrl, isConfigured } from "@/lib/google";

/**
 * 구글 동의 화면으로 보낸다.
 *
 * `state`(무작위 값)를 쿠키에도 심어 두고 돌아올 때 맞춰 본다. 이게 없으면 남이 만든
 * 인가 코드를 사용자 브라우저로 밀어 넣어 **엉뚱한 계정을 연결시키는** 것이 가능하다(CSRF).
 */

export const STATE_COOKIE = "gcal_state";

export function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET이 설정되지 않았습니다." },
      { status: 501 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 동의 화면에서 머무는 시간만 살아 있으면 된다
    maxAge: 600,
  });
  return res;
}
