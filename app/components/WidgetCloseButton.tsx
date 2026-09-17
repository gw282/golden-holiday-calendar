"use client";

import { getCurrentWindow } from "@tauri-apps/api/window";

/** 위젯 헤더의 ✕ — 창을 닫는 건 Tauri API라 이 한 조각만 클라이언트다 */
export default function WidgetCloseButton() {
  return (
    <button
      type="button"
      onClick={() => getCurrentWindow().close()}
      aria-label="위젯 닫기"
      className="rounded px-1.5 text-muted hover:bg-black/10"
    >
      ✕
    </button>
  );
}
