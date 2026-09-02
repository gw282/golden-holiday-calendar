/**
 * 일정 색깔 팔레트.
 *
 * 이 파일은 **DB를 import하지 않는다.** 색 고르는 UI가 클라이언트 컴포넌트라
 * `lib/events.ts`에서 값을 가져오면 `@libsql/client`가 클라이언트 번들로 끌려온다.
 *
 * 색은 Tailwind 클래스가 아니라 hex로 둔다. 클래스명을 문자열로 조립하면
 * Tailwind가 빌드 때 그 클래스를 못 찾아 스타일이 통째로 빠진다.
 */
export type EventColor = {
  key: string;
  label: string;
  hex: string;
  /** 그 색 위에 올릴 글자색. 밝은 색에 흰 글자를 쓰면 대비가 2:1대로 떨어진다 */
  fg: string;
};

const DARK = "#16181d";
const LIGHT = "#ffffff";

/**
 * 라벨은 색 이름이 아니라 **쓰임**이다.
 *
 * '파랑'·'초록'이라고 적어 두면 화면을 보면 아는 사실을 한 번 더 적는 것뿐이라,
 * 며칠 지나면 "빨강이 뭐였더라"가 된다. 자주 쓰는 갈래를 미리 정해 두면
 * 색을 고르는 일이 곧 분류가 되고, 달력의 점 색만 봐도 무슨 일인지 읽힌다.
 *
 * key는 색 이름 그대로 둔다 — 이미 저장된 값이라 바꾸면 기존 일정의 색이 날아간다.
 * 노랑(amber)은 연차 등록이 쓰는 색이라(BookLeaveButton) 라벨도 그쪽에 맞췄다.
 */
export const EVENT_COLORS: EventColor[] = [
  { key: "blue", label: "업무", hex: "#2563eb", fg: LIGHT },
  { key: "green", label: "개인", hex: "#10b981", fg: DARK },
  { key: "amber", label: "휴가 · 연차", hex: "#f59e0b", fg: DARK },
  { key: "red", label: "중요", hex: "#dc2626", fg: LIGHT },
  { key: "purple", label: "약속", hex: "#7c3aed", fg: LIGHT },
  { key: "gray", label: "기타", hex: "#4b5563", fg: LIGHT },
];

/** 색을 안 고른 일정이 쓰는 기본값 */
export const DEFAULT_EVENT_COLOR = "#2f6fed";
const DEFAULT_EVENT_FG = "#ffffff";

export function isEventColorKey(v: unknown): boolean {
  return typeof v === "string" && EVENT_COLORS.some((c) => c.key === v);
}

/** 저장된 키 → 실제 색. 빈 값이나 모르는 키는 기본색으로 돌린다. */
export function colorHex(key: string | null | undefined): string {
  return EVENT_COLORS.find((c) => c.key === key)?.hex ?? DEFAULT_EVENT_COLOR;
}

/** 그 색 위에 올릴 글자색 */
export function colorFg(key: string | null | undefined): string {
  return EVENT_COLORS.find((c) => c.key === key)?.fg ?? DEFAULT_EVENT_FG;
}
