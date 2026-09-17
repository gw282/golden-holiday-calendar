import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 비밀번호 한 겹 — `APP_PASSWORD`가 있을 때만 동작한다.
 *
 * 이 앱에는 로그인이 없다. 원래는 그래도 됐다 — 내 PC에서만 띄웠으니 접속한 사람이
 * 곧 주인이었다. 그런데 인터넷에 올리는 순간 그 전제가 깨진다. 주소를 아는 누구나
 * 일정을 읽고 고칠 수 있고, 더 나쁘게는 **챗봇 요금이 서버를 띄운 계정에 붙는다.**
 * 그래서 호스팅용으로 가장 얇은 문을 하나 달았다.
 *
 * HTTP Basic 인증을 고른 이유: 로그인 화면도, 세션 표도, 쿠키 관리도 필요 없다.
 * 브라우저가 기본 암호 창을 띄워 주고 그 뒤로는 모든 요청에 자동으로 붙여 준다.
 * 일정 CRUD·SSE 챗봇·구글 콜백이 전부 같은 오리진이라 이것만으로 다 덮인다.
 *
 * `APP_PASSWORD`가 비어 있으면 **그냥 통과시킨다.** 로컬 개발 때마다 암호를 묻게
 * 만들면 아무도 안 켜고 살 것이고, 그러면 배포본에서도 안 켜게 된다.
 * ⚠️ 반대로, 인터넷에 올릴 때 이 값을 넣지 않으면 문이 없는 것과 같다.
 *
 * Next 16부터 이 파일 이름은 `middleware.ts`가 아니라 `proxy.ts`다 (런타임은 Node).
 */

/** 길이를 먼저 보고 그다음 전부 XOR — 앞 글자만 맞혀 가며 좁히는 것을 막는다. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function askForPassword(): NextResponse {
  return new NextResponse("로그인이 필요합니다.", {
    status: 401,
    headers: {
      // realm은 브라우저 암호 창에 그대로 뜬다. 헤더라서 ASCII로만 적는다.
      "WWW-Authenticate": 'Basic realm="MG Manage", charset="UTF-8"',
    },
  });
}

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return askForPassword();

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    // base64가 깨진 헤더. 통과시킬 이유가 없다.
    return askForPassword();
  }

  // `user:pass` 중 앞쪽은 보지 않는다 — 쓰는 사람이 한 명이라 아이디를 둘 이유가 없고,
  // 비밀번호에 콜론이 들어가도 되도록 **첫 콜론만** 자른다.
  const given = decoded.slice(decoded.indexOf(":") + 1);
  if (!sameSecret(given, password)) return askForPassword();

  return NextResponse.next();
}

/**
 * matcher를 두지 않아 **정적 파일까지 포함해 모든 요청**을 지난다. 일부러 그렇게 뒀다 —
 * `_next/static`을 열어 두면 화면 자체는 못 보더라도 번들이 통째로 내려간다.
 * Basic 인증은 브라우저가 하위 요청에도 헤더를 자동으로 붙여 주므로 CSS가 빠지지 않는다.
 */
