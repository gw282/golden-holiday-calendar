"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { hasNote, readNote, subscribeNotes, writeNote } from "./localNotes";

/**
 * 달력 셀의 얇은 클라이언트 리프.
 *
 * CalendarGrid.tsx는 계속 서버 컴포넌트로 남는다 — 월/주 레이아웃과 띠(band) 계산은
 * 그대로 서버에서 하고, 이 파일은 셀 하나를 감싸 더블클릭 메모 팝업과 메모 점 표시만
 * 더한다. children은 서버가 이미 계산해 둔 내용(공휴일명·일정 미리보기)을 그대로 받아
 * 다시 계산하지 않는다.
 *
 * 팝업(`<dialog>`)은 **portal로 `document.body`에 띄운다.** 셀이 `grid grid-cols-7`의
 * 직계 자식이라, dialog를 여기 그대로 두면 그 칸도 DOM 형제 취급을 받아
 * `[&:nth-child(7n)]:border-r-0`의 7칸마다 오른쪽 테두리를 빼는 계산이 틀어진다.
 */
export default function DayCellInteractive({
  date,
  href,
  selected,
  className,
  style,
  children,
}: {
  date: string;
  href: string;
  selected: boolean;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState("");
  const [mounted, setMounted] = useState(false);
  const noted = useSyncExternalStore(subscribeNotes, () => hasNote(date), () => false);

  useEffect(() => setMounted(true), []);

  function openMemo() {
    setDraft(readNote(date));
    dialog.current?.showModal();
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    writeNote(date, draft);
    dialog.current?.close();
  }

  return (
    <>
      <Link
        href={href}
        scroll={false}
        aria-current={selected ? "date" : undefined}
        // 더블클릭은 그 앞의 클릭 두 번이 이미 이 날짜로 이동시킨 뒤에 온다 —
        // 같은 날짜를 다시 골라 화면이 안 바뀌므로 막을 필요가 없다.
        onDoubleClick={openMemo}
        title={
          noted
            ? "더블클릭: 메모 보기·수정 (이 PC에만 저장)"
            : "더블클릭: 메모 남기기 (이 PC에만 저장, 서버에 안 올라감)"
        }
        style={style}
        className={`relative ${className}`}
      >
        {children}
        {noted && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent"
          />
        )}
      </Link>

      {mounted &&
        createPortal(
          <dialog
            ref={dialog}
            onClick={(e) => {
              if (e.target === dialog.current) dialog.current?.close();
            }}
            className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/40"
          >
            <form onSubmit={save}>
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <h2 className="text-xs font-semibold">{date} 메모</h2>
                <button
                  type="button"
                  onClick={() => dialog.current?.close()}
                  aria-label="닫기"
                  className="rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="p-3">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="예: 오전 10시 주간 회의"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                />
                <p className="mt-1.5 text-[11px] text-muted">
                  이 메모는 이 기기에만 저장되고, 서버에는 올라가지 않습니다.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
                {draft !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("");
                      writeNote(date, "");
                      dialog.current?.close();
                    }}
                    className="rounded-md px-2 py-1 text-xs text-muted hover:text-foreground"
                  >
                    지우기
                  </button>
                )}
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-on-accent"
                >
                  저장
                </button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
