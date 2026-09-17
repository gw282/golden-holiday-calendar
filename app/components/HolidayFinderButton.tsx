"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PANEL_OPEN_EVENT = "mg-panel-open";

export default function HolidayFinderButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    function closeWhenAnotherPanelOpens(event: Event) {
      if ((event as CustomEvent<string>).detail !== "holiday-finder") setOpen(false);
    }
    window.addEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (dialog.current && !dialog.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggleEnabled() {
    setBusy(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendations: !enabled }),
      });
      if (response.ok) startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    if (next) {
      window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: "holiday-finder" }));
    }
    setOpen(next);
  }

  return (
    <div className="relative inline-block" ref={dialog}>
      <button
        type="button"
        onClick={toggleOpen}
        title="황금 연휴"
        className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        🌟 황금 연휴
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-raised p-3 shadow-lg">
          <label className="flex items-center justify-between gap-3 text-xs text-foreground">
            <span className="font-medium">🌟 황금 연휴 추천</span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={toggleEnabled}
              className="h-3.5 w-3.5 accent-accent"
            />
          </label>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            공휴일과 주말을 이어 쉴 수 있는 휴가 조합을 달력에 보여 줍니다.
          </p>
        </div>
      )}
    </div>
  );
}
