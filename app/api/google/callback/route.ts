import { NextResponse } from "next/server";
import { exchangeCode, GoogleError } from "@/lib/google";
import { STATE_COOKIE } from "../auth/route";

/**
 * 동의 화면에서 돌아오는 자리.
 *
 * 여기서는 JSON을 돌려주지 않는다 — 사용자의 **브라우저 주소창**이 직접 오는 곳이라
 * 결과를 화면에서 봐야 한다. 그래서 어떤 경우에도 `/`로 돌려보내고,
 * 성공·실패는 쿼리(`?gcal=...`)에 실어 대시보드가 한 줄로 알려 준다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const home = new URL("/", url.origin);

  const fail = (why: string) => {
    home.searchParams.set("gcal", "error");
    home.searchParams.set("gcalMsg", why);
    const res = NextResponse.redirect(home);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // 사용자가 동의 화면에서 취소한 경우. 오류가 아니라 그냥 안 한 것이다
  const denied = url.searchParams.get("error");
  if (denied) return fail(denied === "access_denied" ? "연결을 취소했습니다." : denied);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return fail("인가 코드가 없습니다.");

  // 심어 둔 값과 다르면 우리가 시작한 흐름이 아니다
  const expected = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!state || !expected || state !== expected) {
    return fail("요청이 확인되지 않았습니다. 다시 시도해 주세요.");
  }

  try {
    await exchangeCode(code);
  } catch (e) {
    return fail(e instanceof GoogleError ? e.message : "연결에 실패했습니다.");
  }

  home.searchParams.set("gcal", "ok");
  const res = NextResponse.redirect(home);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
