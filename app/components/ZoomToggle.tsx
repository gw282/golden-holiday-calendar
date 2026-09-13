"use client";

import { useSyncExternalStore } from "react";

/** localStorage 키. layout.tsx의 인라인 스크립트도 같은 키를 읽으니 함께 고칠 것 */
const KEY = "zoom";
const CHANGED = "zoomchange";

const LEVELS = [100, 125, 150] as const;
type Level = (typeof LEVELS)[number];

function nextLevel(level: Level): Level {
  const i = LEVELS.indexOf(level);
  return LEVELS[(i + 1) % LEVELS.length];
}

function readZoom(): Level {
  const n = Number(document.documentElement.style.zoom.replace("%", "")) || 100;
  return (LEVELS as readonly number[]).includes(n) ? (n as Level) : 100;
}

function serverZoom(): Level {
  return 100;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/**
 * 화면 확대(100 / 125 / 150%) 토글. 모니터가 작거나 눈이 침침한 사무실 환경을 위한 것.
 *
 * CSS `zoom`을 쓴다 — Tauri/Electron이 둘 다 Chromium 기반 WebView라 표준은 아니어도
 * 안정적으로 지원되고, `transform: scale`과 달리 레이아웃 폭이 실제로 다시 흐른다
 * (transform은 확대된 만큼 옆이 잘리거나 빈 여백이 생긴다).
 */
export default function ZoomToggle() {
  const zoom = useSyncExternalStore(subscribe, readZoom, serverZoom);

  function apply(next: Level) {
    document.documentElement.style.zoom = next === 100 ? "" : `${next}%`;
    try {
      if (next === 100) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(next));
    } catch {
      // 저장 실패해도 이번 세션 안에서는 그대로 적용된다
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <button
      type="button"
      onClick={() => apply(nextLevel(zoom))}
      title={`화면 확대 — ${zoom}%. 눌러서 ${nextLevel(zoom)}%로`}
      aria-label={`화면 확대 ${zoom}%. 눌러서 ${nextLevel(zoom)}%로`}
      className="flex h-5 shrink-0 items-center justify-center rounded-full border border-border px-1.5 text-[10px] font-medium leading-none tabular-nums text-muted hover:border-accent hover:bg-accent-soft hover:text-accent"
    >
      {zoom}%
    </button>
  );
}
