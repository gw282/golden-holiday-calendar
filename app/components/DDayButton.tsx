"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Event } from "@/lib/events";
import { diffDays, formatKo, today } from "@/lib/date";
import { colorHex } from "@/lib/eventColors";

const PANEL_OPEN_EVENT = "mg-panel-open";
const PIN_KEY = "local-dday-pin";
const PIN_CHANGED = "ddaypinchange";

function readPinnedId(): number | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}
function readPinnedIdServer(): number | null {
  return null;
}
function subscribePin(onChange: () => void) {
  window.addEventListener(PIN_CHANGED, onChange);
  return () => window.removeEventListener(PIN_CHANGED, onChange);
}
function setPinnedId(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(PIN_KEY);
    else localStorage.setItem(PIN_KEY, String(id));
  } catch {
    // 저장 실패해도 화면은 그대로 둔다 — 이번 세션 동안은 그대로 적용된다
  }
  window.dispatchEvent(new Event(PIN_CHANGED));
}

/** D-N / D-Day / D+N 표기. 지난 날짜는 +로 얼마나 지났는지를 보여준다 */
function ddayLabel(date: string): string {
  const diff = diffDays(today(), date);
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

/**
 * 헤더의 D-Day 찾기 버튼. 등록된 전체 일정 중 하나를 골라 오늘 기준으로
 * 며칠 남았는지/지났는지를 본다. 연차 잔고 D-day(LeaveBudgetButton)와는
 * 다른 자리 — 그건 휴가 소멸까지만 보고, 이건 **아무 일정이나** 대상이다.
 *
 * 고정(핀)한 일정은 이 PC에만 저장한다(localStorage) — 서버에 저장할 만큼
 * 무거운 설정이 아니고, 기기마다 보고 싶은 일정이 다를 수도 있다.
 */
export default function DDayButton({ events }: { events: Event[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const pinnedId = useSyncExternalStore(subscribePin, readPinnedId, readPinnedIdServer);

  useEffect(() => {
    function closeWhenAnotherPanelOpens(event: globalThis.Event) {
      if ((event as CustomEvent<string>).detail !== "dday") setOpen(false);
    }
    window.addEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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

  function toggleOpen() {
    const next = !open;
    if (next) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: "dday" }));
    setOpen(next);
  }

  // 핀이 가리키는 일정이 지워졌으면(또는 아직 안 골랐으면) 버튼은 기본 표기로 돌아간다
  const pinned = pinnedId !== null ? (events.find((e) => e.id === pinnedId) ?? null) : null;

  // 오늘과 가까운 순으로 — 지났든 남았든 지금 궁금한 건 대개 가장 가까운 날짜다
  const sorted = [...events].sort(
    (a, b) => Math.abs(diffDays(today(), a.date)) - Math.abs(diffDays(today(), b.date)),
  );

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={toggleOpen}
        title="D-Day 찾기"
        className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        {pinned ? (
          <>
            ⏳ <span className="max-w-[7rem] truncate text-foreground">{pinned.title}</span>{" "}
            <span className="font-semibold text-accent">{ddayLabel(pinned.date)}</span>
          </>
        ) : (
          "⏳ D-Day"
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-raised p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-foreground">D-Day 찾기</p>
          {sorted.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11px] text-muted">등록된 일정이 없습니다.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
              {sorted.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent-soft/60"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorHex(e.color) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-xs ${e.done ? "text-muted line-through" : "text-foreground"}`}>
                      {e.title}
                    </span>
                    <span className="block text-[10px] text-muted">{formatKo(e.date)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-accent">
                    {ddayLabel(e.date)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPinnedId(pinnedId === e.id ? null : e.id)}
                    title={pinnedId === e.id ? "고정 해제" : "이 일정을 버튼에 고정"}
                    aria-label={pinnedId === e.id ? "고정 해제" : "이 일정을 버튼에 고정"}
                    className={`shrink-0 rounded px-1 text-sm ${
                      pinnedId === e.id ? "text-accent" : "text-border hover:text-accent"
                    }`}
                  >
                    {pinnedId === e.id ? "★" : "☆"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
