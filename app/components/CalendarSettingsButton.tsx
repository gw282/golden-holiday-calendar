"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WeekStart } from "@/lib/date";
import Toggle from "./Toggle";
import {
  lunarOn,
  lunarOnServer,
  setLunar,
  setSolarTerm,
  setWeekNum,
  solarTermOn,
  solarTermOnServer,
  subscribeLunar,
  subscribeSolarTerm,
  subscribeWeekNum,
  weekNumOn,
  weekNumOnServer,
} from "./calendarDisplay";

const PANEL_OPEN_EVENT = "mg-panel-open";

/**
 * 달력 화면을 어떻게 그릴지 — 절기 표시 · 주차 표시 · 주 시작 요일.
 * 앞 둘은 `calendarDisplay.ts`의 `<html>` 속성 + localStorage 토글(서버를 안 거친다).
 * 주 시작 요일만 `/api/settings` PATCH 후 `router.refresh()`로 서버 컴포넌트
 * (`CalendarGrid`가 받는 주 배열 자체)를 다시 그린다 — 이유는 `lib/settings.ts`의
 * `getWeekStart` 주석 참고.
 */
export default function CalendarSettingsButton({ weekStart }: { weekStart: WeekStart }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const weekNum = useSyncExternalStore(subscribeWeekNum, weekNumOn, weekNumOnServer);
  const solarTerm = useSyncExternalStore(subscribeSolarTerm, solarTermOn, solarTermOnServer);
  const lunar = useSyncExternalStore(subscribeLunar, lunarOn, lunarOnServer);

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

  useEffect(() => {
    function closeWhenAnotherPanelOpens(event: Event) {
      if ((event as CustomEvent<string>).detail !== "calendar") setOpen(false);
    }
    window.addEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
  }, []);

  async function changeWeekStart(next: WeekStart) {
    if (next === weekStart || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: next }),
      });
      if (res.ok) startTransition(() => router.refresh());
    } catch {
      // 실패해도 화면은 그대로 둔다 — 다시 누르면 된다
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          if (next) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: "calendar" }));
          setOpen(next);
        }}
        title="달력 설정"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        📆 달력 설정
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-64 flex-col gap-3 rounded-lg border border-border bg-raised p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 text-xs text-foreground">
            절기 표시
            <Toggle checked={solarTerm} onChange={setSolarTerm} label="절기 표시" />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-foreground">
            주차 표시
            <Toggle checked={weekNum} onChange={setWeekNum} label="주차 표시" />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-foreground">
            음력 표시
            <Toggle checked={lunar} onChange={setLunar} label="음력 표시" />
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs text-foreground">주 시작 요일</p>
            <div className="mt-2 flex gap-1.5">
              <WeekStartOption
                label="월요일"
                active={weekStart === "mon"}
                disabled={busy}
                onClick={() => changeWeekStart("mon")}
              />
              <WeekStartOption
                label="일요일"
                active={weekStart === "sun"}
                disabled={busy}
                onClick={() => changeWeekStart("sun")}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekStartOption({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {label}
    </button>
  );
}
