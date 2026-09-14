"use client";

/**
 * 트레이 미니 팝업 전용 "전체 달력 열기" 버튼.
 *
 * 이 페이지는 트레이 팝업 창(`src-tauri/src/lib.rs`의 "tray" 웹뷰)에서만 뜬다 —
 * 그래서 다른 컴포넌트들처럼 `window.__TAURI_INTERNALS__` 유무를 따로 검사하지
 * 않는다. 이 창 자체가 Tauri 안에서만 존재하기 때문이다.
 */
type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

export default function OpenCalendarButton() {
  function open() {
    const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
    internals?.invoke("show_main").catch(() => {
      // 실패해도 팝업은 그대로 둔다 — 트레이 아이콘을 다시 눌러 보면 된다
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      className="w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent"
    >
      전체 달력 열기
    </button>
  );
}
