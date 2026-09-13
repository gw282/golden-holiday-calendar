"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** localStorage 키. layout.tsx의 인라인 스크립트도 같은 키를 읽으니 함께 고칠 것 */
const KEY = "zoom";
const CHANGED = "zoomchange";

/** layout.tsx의 ZOOM_SCRIPT 화이트리스트와 같은 목록이어야 한다 */
export const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200] as const;
type Level = (typeof ZOOM_LEVELS)[number];

function readZoom(): Level {
  const n = Number(document.documentElement.style.zoom.replace("%", "")) || 100;
  return (ZOOM_LEVELS as readonly number[]).includes(n) ? (n as Level) : 100;
}

function serverZoom(): Level {
  return 100;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/**
 * 화면 확대 배율 선택 (50~200%). 모니터가 작거나 눈이 침침한 사무실 환경을 위한 것.
 *
 * CSS `zoom`을 쓴다 — Tauri/Electron이 둘 다 Chromium 기반 WebView라 표준은 아니어도
 * 안정적으로 지원되고, `transform: scale`과 달리 레이아웃 폭이 실제로 다시 흐른다
 * (transform은 확대된 만큼 옆이 잘리거나 빈 여백이 생긴다).
 *
 * 고를 수 있는 값이 7개라 단추 하나로 순환시키면 100%로 돌아가는 데만 클릭이
 * 여러 번 필요하다. 네이티브 `<select>`는 목록 부분을 OS가 그려서 이 앱 디자인과
 * 안 맞아(`DatePicker`/`TimePicker`와 같은 이유) 직접 그린 팝오버로 고른다.
 */
export default function ZoomToggle() {
  const zoom = useSyncExternalStore(subscribe, readZoom, serverZoom);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Ctrl + 휠로도 조정한다. Chromium은 원래 Ctrl+휠을 브라우저 자체 확대(페이지 배율)로
  // 먼저 가로채므로, 그 기본 동작을 막고 대신 우리 zoom 상태를 움직인다 — 안 그러면
  // 두 가지 확대가 따로 겹쳐 배율이 어긋난다.
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const i = ZOOM_LEVELS.indexOf(readZoom());
      const next =
        e.deltaY < 0
          ? ZOOM_LEVELS[Math.min(i + 1, ZOOM_LEVELS.length - 1)]
          : ZOOM_LEVELS[Math.max(i - 1, 0)];
      apply(next);
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="화면 확대"
        aria-label={`화면 확대 ${zoom}%`}
        className="flex h-5 shrink-0 items-center rounded-full border border-border px-1.5 text-[10px] font-medium leading-none tabular-nums text-muted hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        {zoom}%
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 flex flex-col overflow-hidden rounded-lg border border-border bg-raised py-1 shadow-lg">
          {ZOOM_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => {
                apply(level);
                setOpen(false);
              }}
              className={`px-3 py-1 text-right text-xs tabular-nums ${
                level === zoom
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-foreground hover:bg-accent-soft"
              }`}
            >
              {level}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
