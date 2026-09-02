import { getDb } from "./db";

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
export function isOffline(): boolean {
  const row = getDb().prepare(`SELECT value FROM app_settings WHERE key = 'offline'`).get() as
    | { value: string }
    | undefined;

  // 아직 아무도 손대지 않았으면 환경변수가 기본값을 정한다.
  // 오프라인용 빌드는 OFFLINE_DEFAULT=1로 띄우면 처음부터 꺼진 채로 시작한다.
  if (!row) return process.env.OFFLINE_DEFAULT === "1";
  return row.value === "1";
}

export function setOffline(on: boolean): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES ('offline', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(on ? "1" : "0");
}
