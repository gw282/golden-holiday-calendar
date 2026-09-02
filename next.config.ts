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
};

export default nextConfig;
