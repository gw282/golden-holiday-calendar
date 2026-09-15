"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { formatKo } from "@/lib/date";
import {
  hasEmoji,
  hasNote,
  readEmoji,
  readNote,
  subscribeNotes,
  writeEmoji,
  writeNote,
} from "./localNotes";

/**
 * 달력 셀의 얇은 클라이언트 리프.
 *
 * CalendarGrid.tsx는 계속 서버 컴포넌트로 남는다 — 월/주 레이아웃과 띠(band) 계산은
 * 그대로 서버에서 하고, 이 파일은 셀 하나를 감싸 더블클릭 메모·이모지 팝업과 그 표시만
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
  const [emojiDraft, setEmojiDraft] = useState("");
  const [mounted, setMounted] = useState(false);
  const noted = useSyncExternalStore(subscribeNotes, () => hasNote(date), () => false);
  const emoji = useSyncExternalStore(subscribeNotes, () => readEmoji(date), () => "");

  useEffect(() => setMounted(true), []);

  function openMemo() {
    setDraft(readNote(date));
    setEmojiDraft(readEmoji(date));
    dialog.current?.showModal();
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    writeNote(date, draft);
    writeEmoji(date, emojiDraft);
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
          noted || emoji
            ? "더블클릭: 메모·이모지 보기·수정"
            : "더블클릭: 메모·이모지 남기기"
        }
        style={style}
        className={`relative ${className}`}
      >
        {children}
        {/* 날짜 숫자가 이미 셀 왼쪽 위를 쓰고 있어서(서버가 그리는 Cell), 이모지·메모
            표시는 오른쪽 위 한 자리에 같이 묶어 둔다 — 각자 absolute로 따로 두면
            겹치기 쉽다. */}
        {(emoji || noted) && (
          <span aria-hidden className="absolute right-1 top-0.5 flex items-center gap-0.5">
            {emoji && <span className="text-sm leading-none">{emoji}</span>}
            {noted && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
          </span>
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
                <h2 className="text-xs font-semibold">
                  {date.slice(0, 4)}년 {formatKo(date)} 메모 · 이모지
                </h2>
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
                <div className="flex gap-2">
                  <input
                    value={emojiDraft}
                    onChange={(e) => setEmojiDraft(e.target.value)}
                    placeholder="🎂"
                    maxLength={8}
                    aria-label="날짜 칸에 표시할 이모지"
                    title="Win + . (마침표) 를 누르면 이모지 선택 창이 뜹니다"
                    className="w-12 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-accent"
                  />
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="예: 오전 10시 주간 회의"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-muted">
                  이모지 칸에서 <kbd className="rounded border border-border px-1 font-sans">Win</kbd>+
                  <kbd className="rounded border border-border px-1 font-sans">.</kbd> 을 누르면 윈도우
                  이모지 선택 창이 뜹니다.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
                {(draft !== "" || emojiDraft !== "") && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("");
                      setEmojiDraft("");
                      writeNote(date, "");
                      writeEmoji(date, "");
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
