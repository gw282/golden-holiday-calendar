/** Tauri가 웹뷰에 직접 심어 주는 값으로 설치본인지 판단한다. 서버에는 window가 없어 false. */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
