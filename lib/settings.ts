import { get, run } from "./db";

/**
 * 앱 설정 — 지금은 **오프라인 모드** 하나뿐이다.
 *
 * 회사 망이 인터넷 구간과 폐쇄망으로 갈려 있으면 같은 앱이 두 자리에 놓인다. 오프라인 쪽에서는
 * 항공권·숙소 링크와 환율, 구글 캘린더가 **되지 않는다** — 눌러도 안 열리고,
 * 환율은 받아 오다 시간만 끌다 실패한다. 그럴 바에는 아예 안 보이는 편이 낫다.
 *
 * 설정을 **서버(DB)에 두는 이유**가 중요하다. 화면에서만 감추면 환율을 받아 오는 코드는
 * 서버 컴포넌트라 여전히 돈다 — 오프라인에서 매 요청마다 밖으로 나가려다 타임아웃을 먹는다.
 * 서버가 값을 알아야 **요청 자체를 안 한다.**
 */

/** 오프라인 모드인가 */
export async function isOffline(): Promise<boolean> {
  if (process.env.OFFLINE_DEFAULT === "1") return true;

  const row = await get<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'offline'`,
  );

  // 아직 아무도 손대지 않았으면 환경변수가 기본값을 정한다.
  // 오프라인용 빌드는 OFFLINE_DEFAULT=1로 띄우면 처음부터 꺼진 채로 시작한다.
  if (!row) return process.env.OFFLINE_DEFAULT === "1";
  return row.value === "1";
}

/**
 * 챗봇을 쓸 수 있나 — `CHAT_DISABLED=1`이면 끈다.
 *
 * 오프라인 모드와 **따로 두는 이유**가 있다. 오프라인은 밖으로 나가는 것 전부
 * (항공권·숙소·환율·구글 캘린더)를 같이 끄는 스위치다. 인터넷에 올린 배포본은 그것들을
 * 다 쓰고 싶은데 챗봇만 빼고 싶다 — 챗봇이 끌고 오는 비용이 나머지와 급이 다르기 때문이다:
 * Claude Code 실행 파일이 215MB이고, 자식 프로세스로 뜨느라 RAM을 요구하며,
 * `ANTHROPIC_API_KEY`를 서버에 둬야 해서 **요금이 서버를 띄운 계정에 붙는다.**
 *
 * DB가 아니라 환경변수인 이유: 이건 사용자가 바꿀 취향이 아니라 **그 배포본의 성질**이다.
 * 바이너리를 안 담고 올린 이미지에서 화면의 토글로 켤 수 있으면 켜자마자 고장 난다.
 */
export function isChatEnabled(): boolean {
  return process.env.CHAT_DISABLED !== "1";
}

/**
 * 데스크톱 설치본(Tauri/Electron)인가 — 그 안의 Node 서버를 띄울 때 심어 준
 * `DESKTOP_APP=1`로 판단한다.
 *
 * 오프라인 배지를 숨기는 데만 쓴다. 설치본은 애초에 켜고 끌 수 없는 고정값이라
 * "오프라인"이라고 계속 적어 두면 뭔가 빠진 것처럼 보인다 — 반면 사내망에 호스팅한
 * 배포본(`OFFLINE_DEFAULT=1`이지만 웹 브라우저로 접속)은 계속 밝혀 두는 게 맞다.
 */
export function isDesktopApp(): boolean {
  return process.env.DESKTOP_APP === "1";
}

export async function setOffline(on: boolean): Promise<void> {
  if (process.env.OFFLINE_DEFAULT === "1") return;

  await run(
    `INSERT INTO app_settings (key, value) VALUES ('offline', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [on ? "1" : "0"],
  );
}

/**
 * 황금연휴 추천을 볼 것인가 — 기본은 켜짐. 연차 계획을 이미 다 세운 사람에게는
 * 매번 계산해 보여주는 추천이 그냥 화면을 차지하는 것일 수 있어 끌 수 있게 둔다.
 * 꺼 두면 page.tsx가 계산 자체를 건너뛴다(감추기만 하는 게 아니라).
 */
export async function isRecommendationEnabled(): Promise<boolean> {
  const row = await get<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'recommendations'`,
  );
  return row ? row.value === "1" : true;
}

export async function setRecommendationEnabled(on: boolean): Promise<void> {
  await run(
    `INSERT INTO app_settings (key, value) VALUES ('recommendations', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [on ? "1" : "0"],
  );
}
