import fs from "node:fs";
import path from "node:path";

/**
 * 배포용 폴더 만들기 — `npm run package`
 *
 * `dist/`에 **그대로 복사해서 실행할 수 있는 한 벌**을 만든다. 받는 쪽에 필요한 것은
 * Node 24 하나뿐이다. `npm install`도, 인터넷도 필요 없다 — 내부망에 올릴 때 이게 중요하다.
 *
 * `output: "standalone"` 덕분에 실제로 쓰는 모듈만 들어간다.
 *
 * ⚠️ **받는 쪽 OS·아키텍처가 이 PC와 같아야 한다.** DB 드라이버가 libSQL로 바뀌면서
 * 로컬 파일(`file:`)을 여는 데 네이티브 애드온을 쓴다 — 꾸러미에 `@libsql/win32-x64-msvc`
 * 같은 **플랫폼 전용 패키지 하나가 실려 나간다.** `node:sqlite` 시절에는 이 제약이
 * 없었다(Node 내장이라 바이너리가 없었다). 윈도우 → 윈도우는 그냥 되고,
 * 윈도우 → 리눅스는 받는 쪽에서 `npm install`을 한 번 해야 한다.
 *
 * ⚠️ **`data/`는 반드시 뺀다.** Next가 의존성 추적으로 `data/app.db`를 딸려 넣는데,
 * 거기에는 개발용 일정은 물론 **구글 갱신 토큰**이 들어 있을 수 있다. 갱신 토큰은
 * 사실상 비밀번호라, 배포 꾸러미에 실려 나가면 그걸 받은 사람이 캘린더를 읽을 수 있다.
 * 빼고 나가면 첫 실행 때 빈 DB가 새로 만들어진다.
 */

const root = process.cwd();
const dist = path.join(root, "dist");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.error("먼저 빌드해 주세요:  npm run build");
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(standalone, dist, { recursive: true });

// standalone은 정적 파일과 public을 안 넣어 준다 (CDN에 올리는 경우를 기본으로 보기 때문).
// 우리는 서버 하나로 다 내보내므로 직접 넣는다. 빠뜨리면 CSS 없는 화면이 뜬다.
fs.cpSync(path.join(root, ".next", "static"), path.join(dist, ".next", "static"), {
  recursive: true,
});
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(dist, "public"), { recursive: true });
}

// 개발용 DB(와 구글 토큰)를 지운다. 첫 실행 때 빈 것이 새로 생긴다
const shipped = path.join(dist, "data");
const removed = fs.existsSync(shipped);
fs.rmSync(shipped, { recursive: true, force: true });

fs.writeFileSync(
  path.join(dist, "시작.bat"),
  [
    "@echo off",
    "chcp 65001 > nul",
    "cd /d %~dp0",
    "",
    "REM 인터넷이 없는 곳에서 쓸 때는 아래 줄의 REM을 지우세요.",
    "REM 항공권·숙소·환율·구글 캘린더가 처음부터 꺼진 채로 뜹니다.",
    "REM set OFFLINE_DEFAULT=1",
    "",
    "set PORT=3000",
    "set HOSTNAME=0.0.0.0",
    "echo 황금연휴 캘린더 - http://localhost:%PORT%",
    "node server.js",
    "pause",
    "",
  ].join("\r\n"),
);

fs.writeFileSync(
  path.join(dist, "읽어주세요.txt"),
  [
    "황금연휴 캘린더 — 실행 방법",
    "",
    "필요한 것: Node 24 이상 (https://nodejs.org)",
    "  * 24 미만에서는 뜨지 않습니다. DB로 Node 24 내장 node:sqlite를 씁니다.",
    "  * 확인:  node -v",
    "",
    "실행:  시작.bat 을 더블클릭 → 브라우저에서 http://localhost:3000",
    "  (리눅스/맥은  PORT=3000 node server.js )",
    "",
    "인터넷이 없는 곳에서 쓰는 경우",
    "  시작.bat 의  REM set OFFLINE_DEFAULT=1  줄에서 앞의 REM 을 지우세요.",
    "  항공권·숙소·환율·구글 캘린더가 처음부터 꺼진 채로 시작합니다.",
    "  (머리말의 온라인/오프라인 단추로 언제든 바꿀 수 있습니다)",
    "",
    "데이터",
    "  data/app.db 파일 하나가 전부입니다. 백업은 이 파일을 복사하면 됩니다.",
    "  처음 실행하면 자동으로 만들어지고 공휴일 5년치가 들어갑니다.",
    "  초기화하려면 data 폴더를 지우고 다시 실행하세요.",
    "",
    "구글 캘린더 연동 (안 써도 나머지는 다 됩니다)",
    "  이 폴더에 .env.local 파일을 만들고 아래 두 줄을 채우세요.",
    "    GOOGLE_CLIENT_ID=...",
    "    GOOGLE_CLIENT_SECRET=...",
    "  구글 클라우드 콘솔 > 사용자 인증 정보 > OAuth 클라이언트 ID(웹)에서 받고,",
    "  승인된 리디렉션 URI 에  http://localhost:3000/api/google/callback  을 등록합니다.",
    "",
  ].join("\r\n"),
);

/** 폴더 크기(바이트) */
function sizeOf(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? sizeOf(p) : fs.statSync(p).size;
  }
  return total;
}

const mb = (sizeOf(dist) / 1024 / 1024).toFixed(1);
console.log(`dist/ 준비 완료 — ${mb} MB`);
if (removed) console.log("개발용 data/ 는 빼고 담았습니다 (구글 토큰이 실려 나가지 않도록).");
console.log("이 폴더를 통째로 옮기고  시작.bat  을 실행하면 됩니다.");
