"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const PANEL_OPEN_EVENT = "mg-panel-open";

/** localStorage 키. layout.tsx의 인라인 스크립트도 같은 키를 읽으니 함께 고칠 것 */
const ZOOM_KEY = "zoom";
const ZOOM_CHANGED = "zoomchange";
/** layout.tsx의 ZOOM_SCRIPT 화이트리스트와 같은 목록이어야 한다 */
const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200] as const;
type Zoom = (typeof ZOOM_LEVELS)[number];

function readZoom(): Zoom {
  const n = Number(document.documentElement.style.zoom.replace("%", "")) || 100;
  return (ZOOM_LEVELS as readonly number[]).includes(n) ? (n as Zoom) : 100;
}
function serverZoom(): Zoom {
  return 100;
}
function subscribeZoom(onChange: () => void) {
  window.addEventListener(ZOOM_CHANGED, onChange);
  return () => window.removeEventListener(ZOOM_CHANGED, onChange);
}
function applyZoom(next: Zoom) {
  document.documentElement.style.zoom = next === 100 ? "" : `${next}%`;
  try {
    if (next === 100) localStorage.removeItem(ZOOM_KEY);
    else localStorage.setItem(ZOOM_KEY, String(next));
  } catch {
    // 저장 실패해도 이번 세션 안에서는 그대로 적용된다
  }
  window.dispatchEvent(new Event(ZOOM_CHANGED));
}

const THEME_KEY = "theme";
const THEME_CHANGED = "themechange";
type Theme = "system" | "light" | "dark";
const THEME_FACE: Record<Theme, { icon: string; label: string }> = {
  system: { icon: "◐", label: "시스템 설정" },
  light: { icon: "☀", label: "라이트" },
  dark: { icon: "☾", label: "다크" },
};
function readTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}
function serverTheme(): Theme {
  return "system";
}
function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGED, onChange);
  return () => window.removeEventListener(THEME_CHANGED, onChange);
}
function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "system") {
    root.removeAttribute("data-theme");
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      // 무시
    }
  } else {
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 무시
    }
  }
  window.dispatchEvent(new Event(THEME_CHANGED));
}

/**
 * 화면 배율·테마를 한 팝업으로 묶었다. 예전엔 헤더에 각자 따로(125% 배지 +
 * 동그란 테마 버튼) 있었는데, 둘 다 "화면이 어떻게 보이는지"를 정하는
 * 같은 성격의 설정이라 굳이 자리를 나눌 이유가 없었다 — 헤더 왼쪽이
 * 버튼 6개로 붐비던 것도 이걸로 하나 줄었다.
 *
 * 저장 키(zoom/theme)와 이벤트 이름은 예전 ZoomToggle/ThemeToggle과
 * 그대로 맞췄다 — layout.tsx의 첫 페인트 스크립트가 같은 키를 읽는다.
 */
export default function DisplaySettingsButton() {
  const zoom = useSyncExternalStore(subscribeZoom, readZoom, serverZoom);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeWhenAnotherPanelOpens(event: Event) {
      if ((event as CustomEvent<string>).detail !== "display") setOpen(false);
    }
    window.addEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
  }, []);

  // Ctrl + 휠로도 배율을 조정한다 — 팝업이 닫혀 있어도 동작해야 하니 항상 걸어 둔다.
  // Chromium은 원래 Ctrl+휠을 브라우저 자체 확대로 먼저 가로채므로 그 기본 동작을 막는다.
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const i = ZOOM_LEVELS.indexOf(readZoom());
      const next =
        e.deltaY < 0
          ? ZOOM_LEVELS[Math.min(i + 1, ZOOM_LEVELS.length - 1)]
          : ZOOM_LEVELS[Math.max(i - 1, 0)];
      applyZoom(next);
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

  function toggleOpen() {
    const next = !open;
    if (next) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: "display" }));
    setOpen(next);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggleOpen}
        title="화면 설정 — 배율·테마 (Ctrl + 마우스 휠로 배율 조정)"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        🖥️ 화면 설정
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-border bg-raised p-3 shadow-lg">
          <p className="text-[11px] font-semibold text-foreground">화면 배율</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => applyZoom(level)}
                className={`rounded-md px-1 py-1 text-[11px] tabular-nums ${
                  level === zoom
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-foreground hover:bg-accent-soft"
                }`}
              >
                {level}%
              </button>
            ))}
          </div>

          <p className="mt-3 text-[11px] font-semibold text-foreground">테마</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {(Object.keys(THEME_FACE) as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => applyTheme(t)}
                className={`flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] ${
                  t === theme
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-foreground hover:bg-accent-soft"
                }`}
              >
                <span aria-hidden className="text-xs leading-none">
                  {THEME_FACE[t].icon}
                </span>
                {THEME_FACE[t].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
