# syntax=docker/dockerfile:1

# 황금연휴 캘린더 — Fly.io용 이미지
#
# 두 가지가 이 파일의 모양을 결정했다.
#
# 1) **리눅스에서 npm ci를 다시 돌린다.** 윈도우에서 깔린 node_modules를 복사하면 안 된다 —
#    Claude Code 실행 파일이 플랫폼별 optional dependency로 들어와서, 그 안에 있는 것이
#    `claude.exe`(win32)다. 리눅스 컨테이너에서는 실행되지 않는다.
#
# 2) **`node:24-slim`(glibc)을 쓰고 alpine을 쓰지 않는다.** 위의 플랫폼 패키지가
#    glibc용과 musl용으로 갈려 있어서, alpine으로 가면 musl 쪽을 받아야 한다.
#    Node 24가 필요한 이유는 DB가 내장 `node:sqlite`이기 때문이다 (23 이하에는 없다).

# 챗봇을 담을지. 기본은 **안 담는다** — 실행 파일 하나가 215MB이고, 자식 프로세스로
# 뜨느라 RAM을 요구하며, ANTHROPIC_API_KEY를 서버에 둬야 해서 요금이 그 계정에 붙는다.
# 담고 싶으면:  fly deploy --build-arg WITH_CHAT=1
ARG WITH_CHAT=0

# ---- 의존성 ----------------------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app
# 소스보다 먼저 복사한다. 소스만 고쳤을 때 이 층을 캐시에서 재사용하려는 것이다.
COPY package.json package-lock.json ./
RUN npm ci

# ---- 빌드 ------------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next.config.ts의 output:"standalone" 덕분에 실제로 쓰는 모듈만 골라 나온다
RUN npm run build

# ---- 실행 (공통) -----------------------------------------------------------
FROM node:24-slim AS runner-base
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
# standalone은 정적 파일과 public을 안 넣어 준다 (CDN에 올리는 경우를 기본으로 보기 때문).
# 서버 하나로 다 내보내므로 직접 넣는다. 빠뜨리면 CSS 없는 화면이 뜬다.
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# ⚠️ 의존성 추적이 개발용 `data/app.db`를 standalone에 딸려 넣는 일이 있다.
#    거기에는 구글 갱신 토큰이 들어 있을 수 있다. 지우고 빈 자리만 남긴다 —
#    Fly 볼륨이 이 자리에 마운트되고, 첫 실행 때 빈 DB가 새로 만들어진다.
RUN rm -rf /app/data && mkdir -p /app/data

EXPOSE 3000
CMD ["node", "server.js"]

# ---- 실행: 챗봇 없이 (기본) ------------------------------------------------
FROM runner-base AS runner-chat-0
# 서버가 스스로 알아야 한다. 바이너리가 없는 이미지에서 챗봇을 부르면 자식 프로세스를
# 띄우려다 500으로 실패하는데, 이 값이 있으면 요청을 만들지도 않고 503으로 되돌린다.
ENV CHAT_DISABLED=1

# ---- 실행: 챗봇 담아서 -----------------------------------------------------
FROM runner-base AS runner-chat-1
# Next의 standalone 추적은 `@anthropic-ai/claude-agent-sdk`만 넣고 **플랫폼 패키지를
# 빼먹는다** (자식 프로세스로 spawn하는 것이라 정적 분석에 안 걸린다). 실제 `claude`
# 바이너리가 그 안에 있으므로 스코프째 덮어써 준다.
COPY --from=deps /app/node_modules/@anthropic-ai ./node_modules/@anthropic-ai

# ---- 최종 선택 -------------------------------------------------------------
FROM runner-chat-${WITH_CHAT} AS final
