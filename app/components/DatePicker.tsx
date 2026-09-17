"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  formatMonthKo,
  isValidDateStr,
  monthEnd,
  monthOf,
  monthStart,
  startOfWeek,
  today,
  type DateStr,
  type MonthStr,
} from "@/lib/date";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * 브라우저 기본 `<input type="date">`를 대신하는 달력 팝오버.
 *
 * WebView2(Tauri/Electron)의 네이티브 날짜 선택창이 앱 디자인과 전혀 안 맞고
 * OS마다 생김새가 달라 손댈 수도 없어서, 이 앱 달력과 같은 룩으로 직접 그린다.
 * `lib/date.ts`는 DB를 참조하지 않는 순수 함수라 클라이언트에서 그대로 써도 안전하다.
 */
export default function DatePicker({
  value,
  onChange,
  min,
  disabled,
  ariaLabel,
  placeholder = "날짜 선택",
}: {
  value: DateStr | "";
  onChange: (v: DateStr) => void;
  min?: DateStr;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<MonthStr>(monthOf(value || today()));
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

  function openPicker() {
    setViewMonth(monthOf(value || today()));
    setOpen(true);
  }

  const days = buildMonthDays(viewMonth);
  const t = today();

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={ariaLabel}
        className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent disabled:opacity-40"
      >
        {value ? formatDot(value) : <span className="text-muted">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-raised p-2.5 shadow-lg">
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              aria-label="이전 달"
              className="rounded-md px-2 py-0.5 text-sm text-muted hover:bg-accent-soft hover:text-accent"
            >
              ‹
            </button>
            <span className="text-xs font-semibold">{formatMonthKo(viewMonth)}</span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              aria-label="다음 달"
              className="rounded-md px-2 py-0.5 text-sm text-muted hover:bg-accent-soft hover:text-accent"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-[10px] text-muted">
                {w}
              </span>
            ))}
            {days.map((d) => {
              const disabledDay = min !== undefined && d.date < min;
              const selected = d.date === value;
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => {
                    onChange(d.date);
                    setOpen(false);
                  }}
                  className={`rounded-md py-1 text-xs tabular-nums transition-colors ${
                    !d.inMonth ? "text-muted/50" : "text-foreground"
                  } ${selected ? "bg-accent text-on-accent" : "hover:bg-accent-soft"} ${
                    d.date === t && !selected ? "font-semibold text-accent" : ""
                  } ${disabledDay ? "cursor-not-allowed opacity-30 hover:bg-transparent" : ""}`}
                >
                  {Number(d.date.slice(8, 10))}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              onChange(t);
              setOpen(false);
            }}
            className="mt-1.5 w-full rounded-md py-1 text-[11px] text-muted hover:bg-accent-soft hover:text-accent"
          >
            오늘로
          </button>
        </div>
      )}
    </div>
  );
}

function buildMonthDays(month: MonthStr): { date: DateStr; inMonth: boolean }[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);

  const out: { date: DateStr; inMonth: boolean }[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    out.push({ date: d, inMonth: d >= first && d <= last });
  }
  return out;
}

/** '2026.9.25' — 버튼 자리에 짧게 쓰는 표기 */
function formatDot(s: DateStr): string {
  if (!isValidDateStr(s)) return s;
  return `${Number(s.slice(0, 4))}.${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
}
