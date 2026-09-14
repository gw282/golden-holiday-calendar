"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tauri 창 제어 — 투명도 · 미니 모드 · 자동 실행. 전부 설치본 전용이라
 * `window.__TAURI_INTERNALS__`가 있을 때만(=Tauri 웹뷰 안일 때만) 렌더링된다.
 *
 * `@tauri-apps/api` npm 패키지를 새로 받는 대신, 그 패키지의 `invoke`가 내부적으로
 * 하는 일과 같은 `window.__TAURI_INTERNALS__.invoke`를 직접 부른다 — 이미
 * `EventFields.tsx`가 Tauri 여부를 판단할 때 같은 전역을 쓰고 있어 방식을 맞췄다.
 */
type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (!internals) return Promise.reject(new Error("Tauri 환경이 아닙니다"));
  return internals.invoke(cmd, args) as Promise<T>;
}

export default function DesktopControls() {
  const [isTauri, setIsTauri] = useState(false);
  const [open, setOpen] = useState(false);
  const [opacity, setOpacityState] = useState(100);
  const [mini, setMini] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  useEffect(() => {
    const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    setIsTauri(tauri);
    if (tauri) {
      invoke<boolean>("get_autostart")
        .then(setAutostart)
        .catch(() => {
          // 못 읽어도 화면은 기본값(꺼짐)으로 보여 준다
        });
    }
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

  if (!isTauri) return null;

  async function applyOpacity(next: number) {
    setOpacityState(next);
    setError(null);
    try {
      await invoke("set_opacity", { value: next / 100 });
    } catch (e) {
      // 실패해도 슬라이더는 그대로 둔다 — 다시 움직이면 된다
      setError(errMsg(e));
    }
  }

  async function toggleMini() {
    const next = !mini;
    setBusy(true);
    setError(null);
    try {
      await invoke("toggle_mini", { mini: next });
      setMini(next);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutostart() {
    const next = !autostart;
    setBusy(true);
    setError(null);
    try {
      await invoke("set_autostart", { enabled: next });
      setAutostart(next);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="창 투명도 · 미니 모드 · 자동 실행"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${mini || autostart ? "bg-accent" : "bg-border"}`}
        />
        창
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 flex w-52 flex-col gap-3 rounded-lg border border-border bg-raised p-3 shadow-lg">
          <div className="flex flex-col gap-1">
            <label htmlFor="desktop-opacity" className="text-[11px] text-muted">
              투명도 {opacity}%
            </label>
            <input
              id="desktop-opacity"
              type="range"
              min={30}
              max={100}
              value={opacity}
              onChange={(e) => applyOpacity(Number(e.target.value))}
              className="accent-accent"
            />
          </div>

          <button
            type="button"
            onClick={toggleMini}
            disabled={busy}
            className={`rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
              mini
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-foreground hover:border-accent hover:text-accent"
            }`}
          >
            {mini ? "미니 모드 끄기" : "미니 모드"}
          </button>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={autostart}
              disabled={busy}
              onChange={toggleAutostart}
              className="h-3.5 w-3.5 accent-accent"
            />
            시작 시 자동 실행
          </label>

          {error && (
            <p className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              오류: {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
