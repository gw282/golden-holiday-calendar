"use client";

import { useEffect, useRef, useState } from "react";

/** 30분 단위 목록 — 00:00부터 23:30까지 48개 */
const SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 브라우저 기본 `<input type="time">`를 대신하는 목록형 팝오버.
 * 30분 단위로 빠르게 고르고, 정확한 시각이 필요하면 위쪽 입력칸에 직접 친다.
 * `DatePicker.tsx`와 같은 이유로 만들었다 — 네이티브 시각 선택기는 손댈 곳이 없다.
 */
export default function TimePicker({
  value,
  onChange,
  disabled,
  ariaLabel,
  placeholder = "시각 선택",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // 열리면 지금 값(또는 가장 가까운 값) 자리로 스크롤해 매번 맨 위부터 훑지 않게 한다
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: "center" });
  }, [open]);

  function commit(v: string) {
    if (TIME_RE.test(v)) onChange(v);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-label={ariaLabel}
        className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent disabled:opacity-40"
      >
        {value || <span className="text-muted">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-36 rounded-xl border border-border bg-raised p-2 shadow-lg">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(draft);
            }}
            placeholder="HH:MM"
            aria-label={`${ariaLabel} 직접 입력`}
            className="mb-1.5 w-full rounded-md border border-border bg-transparent px-2 py-1 text-center text-xs tabular-nums text-foreground outline-none focus:border-accent"
          />
          <div ref={listRef} className="max-h-40 overflow-y-auto pr-0.5">
            {SLOTS.map((t) => (
              <button
                key={t}
                type="button"
                data-selected={t === value}
                onClick={() => commit(t)}
                className={`block w-full rounded-md py-1 text-center text-xs tabular-nums ${
                  t === value ? "bg-accent text-on-accent" : "text-foreground hover:bg-accent-soft"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
