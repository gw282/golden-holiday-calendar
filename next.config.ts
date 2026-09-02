import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 배포를 **폴더 하나 복사**로 끝내기 위한 설정.
   *
   * 기본 빌드는 실행할 때 `node_modules`가 통째로 있어야 한다(수백 MB에 수만 개 파일).
   * `standalone`은 실제로 쓰는 것만 골라 `.next/standalone`에 서버까지 같이 넣어 주므로,
   * 그 폴더를 압축해 옮기고 `node server.js`만 하면 끝난다.
   *
   * 이 앱에 특히 잘 맞는 이유: DB가 Node 24 **내장** `node:sqlite`라 네이티브 바이너리가
   * 없다. 네이티브 모듈이 있으면 옮긴 PC의 OS·아키텍처가 같아야 하는데 그 걱정이 없다.
   */
  output: "standalone",

  /**
   * 챗봇 SDK를 **서버리스 함수 추적에서 뺀다.**
   *
   * `/api/chat`이 `@anthropic-ai/claude-agent-sdk`를 import하는데, 그 SDK는 실제
   * Claude Code 실행 파일을 플랫폼별 패키지로 끌고 온다 — 리눅스판이 **205MB**다.
   * Vercel의 서버리스 함수 한도는 압축 해제 기준 250MB라, 그대로 두면 이 함수 하나 때문에
   * 배포가 실패한다.
   *
   * 빼도 되는 이유: **서버리스에서는 챗봇이 애초에 못 돈다.** SDK가 Claude Code를
   * 자식 프로세스로 띄우는 구조라 함수 런타임에서는 성립하지 않는다. 그래서 배포본에는
   * `CHAT_DISABLED=1`을 넣고, 라우트가 요청을 만들지도 않고 503으로 되돌린다
   * (`lib/settings.ts`의 isChatEnabled).
   *
   * 로컬 개발과 폴더 복사 배포에는 영향이 없다 — 거기서는 이 추적을 쓰지 않는다.
   */
  outputFileTracingExcludes: {
    "/api/chat": ["node_modules/@anthropic-ai/**"],
  },
};

export default nextConfig;
