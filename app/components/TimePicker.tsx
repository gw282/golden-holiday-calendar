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
 * 시(HH)가 몇 자리인지 스마트하게 감지해 ":"를 끼워 넣는다. 콜론은 늘 사용자
 * 입력이 아니라 이 함수가 붙인다 — 원본은 숫자만 남긴 문자열이고, 매 입력마다
 * 이 숫자열을 처음부터 다시 해석해서 표시값을 만든다.
 *
 * 첫 자리로 시가 한 자리인지 두 자리인지 갈린다 — 시는 최대 23이라:
 * - 첫 자리가 3~9면 30~99는 있을 수 없는 시각이니 그 한 자리로 시가 끝났다고 본다
 *   (예: "9" → "9:", 이어서 "30" 치면 "9:30").
 * - 첫 자리가 0·1이면 두 자리를 다 봐야 한다 (00~19 전부 가능).
 * - 첫 자리가 2면 둘째 자리를 봐야 안다 — 0~3이면 20~23(두 자리), 4~9면 24~29는
 *   없는 시각이라 앞자리 "2" 하나로 확정하고 둘째 자리부터 분으로 넘긴다.
 *
 * `deletingPrevDigits`는 백스페이스로 지우는 중일 때만 이전 숫자열을 받는다.
 * ":"는 숫자가 아니라서 지워도 숫자열 자체는 그대로다 — 그러면 이 함수가 매번
 * 처음부터 다시 해석해 콜론을 곧바로 되살려 버려, 지운 게 없던 일이 된 것처럼
 * 보인다("한번 입력하면 안 지워짐"). 그래서 지우는 중에 숫자열이 안 줄었으면
 * (=콜론만 지워진 것이면) 숫자도 하나 같이 지운다.
 */
function formatTimeDraft(raw: string, deletingPrevDigits: string | null): string {
  let digits = raw.replace(/\D/g, "").slice(0, 4);
  if (deletingPrevDigits !== null && digits === deletingPrevDigits && digits.length > 0) {
    digits = digits.slice(0, -1);
  }
  if (digits.length === 0) return "";

  const d1 = digits[0];
  if (d1 >= "3") return `${d1}:${digits.slice(1, 3)}`;
  if (digits.length === 1) return d1;

  const d2 = digits[1];
  if (d1 === "2" && d2 >= "4") return `2:${digits.slice(1, 3)}`;

  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

/** 한 자리 시·분을 "09:05"처럼 두 자리로 채운다. 저장(Enter) 시점에만 부른다 —
    타이핑 중에는 아직 뭘 채울지 모른다(9가 09인지 90…까지 갈지 알 수 없다) */
function normalizeTime(v: string): string | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v);
  if (!m) return null;
  const normalized = `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;
  return TIME_RE.test(normalized) ? normalized : null;
}

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
    const normalized = normalizeTime(v);
    if (normalized) onChange(normalized);
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
            onChange={(e) => {
              const raw = e.target.value;
              const isDeleting = raw.length < draft.length;
              setDraft(formatTimeDraft(raw, isDeleting ? draft.replace(/\D/g, "") : null));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(draft);
            }}
            placeholder="HH:MM"
            maxLength={5}
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
