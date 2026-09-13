"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LABELS: Record<number, string> = {
  15: "15분 전",
  30: "30분 전",
  60: "1시간 전",
  120: "2시간 전",
};

/**
 * 일정 알림을 몇 분 전에 줄지 고르는 팝오버. 설치본(Tauri)에서만 뜻이 있어서
 * `isDesktopApp()`일 때만 렌더링된다 — 웹 배포본은 이 알림 자체가 없다.
 *
 * 값은 DB(app_settings)에 있고, Rust 쪽 알림 스레드가 30초마다 `/api/settings`를
 * 그대로 읽으므로 여기서 체크박스를 바꾸면 앱을 다시 켤 필요 없이 다음 폴링부터
 * 반영된다.
 */
export default function ReminderSettings({
  options,
  selected,
}: {
  options: readonly number[];
  selected: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(new Set(selected));
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  async function toggle(minutes: number) {
    const next = new Set(checked);
    if (next.has(minutes)) next.delete(minutes);
    else next.add(minutes);
    setChecked(next);
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderThresholds: [...next] }),
      });
      if (res.ok) router.refresh();
    } catch {
      // 실패해도 화면은 그대로 둔다. 다시 누르면 된다
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="일정 시작 몇 분 전에 윈도우 알림을 줄지"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${checked.size > 0 ? "bg-accent" : "bg-border"}`} />
        알림 시점
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-36 flex-col gap-0.5 rounded-lg border border-border bg-raised p-2 shadow-lg">
          {options.map((minutes) => (
            <label
              key={minutes}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-foreground hover:bg-accent-soft"
            >
              <input
                type="checkbox"
                checked={checked.has(minutes)}
                disabled={busy}
                onChange={() => toggle(minutes)}
                className="h-3.5 w-3.5 accent-accent"
              />
              {LABELS[minutes] ?? `${minutes}분 전`}
            </label>
          ))}
          {checked.size === 0 && (
            <p className="mt-1 px-1.5 text-[10px] text-muted">전부 끄면 알림이 안 옵니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
