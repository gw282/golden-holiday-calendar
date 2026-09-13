# Tauri 데스크톱 셸

`src-tauri/`가 Electron을 대신하는 두 번째 데스크톱 패키징 경로다. 결과물이 훨씬 작다 —
같은 앱을 Electron으로 싸면 163MB, Tauri로 싸면 **32MB**다. 차이는 Chromium을 담느냐다.
Electron은 Chromium을 통째로 들고 다니고, Tauri는 OS에 이미 있는 **WebView2**(Windows 11
기본 내장, Windows 10도 2022년 이후 이미지는 대부분 있음)를 그대로 쓴다.

## 왜 되는가 — 서버는 그대로, 창만 다르다

이 앱은 Next.js 서버(API 라우트 + libSQL)가 있어야 돌아간다. Tauri는 프론트만 감싸는
도구라 서버 로직을 Rust로 새로 짜야 할 것 같지만, 그럴 필요가 없다 — **Node 서버를
사이드카로 그대로 띄우면 된다.**

`src-tauri/src/lib.rs`가 하는 일:

1. `npm run package`로 만든 Next standalone 서버(`dist/`)와, 지금 이 PC의 `node.exe`를
   리소스로 번들한다(`scripts/tauri-package.mjs`).
2. 앱을 실행하면 Rust가 그 `node.exe`로 `server.js`를 자식 프로세스로 띄운다
   (`127.0.0.1:3210`, `APP_DATA_DIR`를 `%APPDATA%\Golden Holiday Calendar\data`로 지정).
3. 포트가 열릴 때까지 기다렸다가, WebView2 창을 그 주소로 연다.

쿼리 63개짜리 SQL도, 17개 API 라우트도 손대지 않는다 — Electron 때와 똑같이 "서버는
Node가 그대로 돌리고 창만 감싼다"는 전략이고, 대체할 것은 Chromium 대신 WebView2뿐이다.

## 이 빌드는 처음부터 오프라인 · 챗봇 없이 뜬다

`lib.rs`가 서버를 띄울 때 `OFFLINE_DEFAULT=1`, `CHAT_DISABLED=1`을 박아 둔다.
회사 망분리 내부망 배포를 염두에 둔 값이다 — 항공권·숙소·환율·구글 캘린더·챗봇이
전부 꺼진 채로 뜬다(`lib/settings.ts` 참고). 인터넷에 올리는 Fly 배포본과는 성격이
다른 빌드라는 뜻이다.

## WebView2 없는 PC — 트레이드오프를 미리 정해 둔 것

`tauri.conf.json`은 `windows.webviewInstallMode`를 **일부러 지정하지 않는다**
(기본값 `downloadBootstrapper`). 이러면 설치 파일이 작다(32MB) — 대신 그 PC에
WebView2가 없으면 설치 중에 인터넷으로 내려받으려 시도한다.

한때 `offlineInstaller`로 WebView2 설치본(203MB)을 통째로 넣어 봤다 — 그러면
"인터넷 없이도 100% 설치 보장"은 되지만 결과물이 238MB로 **Electron보다 커진다.**
그러면 Tauri로 바꾸는 의미(작은 용량)가 없어진다.

Windows 11 은 WebView2가 기본 내장이라 이 문제가 없다. 대상 PC가 Windows 11이
아니거나 오래된 Windows 10 이미지라 WebView2가 없는 게 확인되면, 그때는
`offlineInstaller`로 되돌리거나(용량 포기), IT가 WebView2 Runtime을 한 번만
사내 배포 도구로 깔아 두는 쪽(설치 파일은 계속 작게 유지)을 검토할 것.

## 빌드

```bash
npm run tauri:dev     # 개발 — Next dev 서버(3000)를 그대로 띄워 감싼다
npm run tauri:build   # npm run package(Next build) → 리소스 정리 → cargo build → nsis
```

결과물: `src-tauri/target/release/bundle/nsis/Golden Holiday Calendar_<버전>_x64-setup.exe`

`src-tauri/runtime/`(번들 리소스로 복사된 dist+node.exe)와 `src-tauri/target/`(Rust
빌드 산출물)은 매 빌드마다 다시 만들어지므로 git에 올리지 않는다.

## Electron과 나란히 둔 이유

Electron 경로(`electron/`, `npm run desktop:build`)는 그대로 남아 있다. Tauri 쪽이
아직 이 앱에서 오래 검증된 경로가 아니라서, 문제가 생기면 되돌아갈 곳이 필요하다.
둘 다 같은 `dist/`(standalone 서버)를 그대로 재사용하므로 유지 비용은 낮다.
