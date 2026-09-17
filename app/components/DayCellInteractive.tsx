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
 * 이모지 최대 3개로 자른다. `string.length`로 자르면 이모지 하나가 UTF-16
 * 코드 유닛을 여러 개 쓰는 경우(피부톤·국기·ZWJ 합성 이모지 등) 중간이
 * 잘려 깨진 글자가 남는다 — `Intl.Segmenter`로 "사람이 보는 글자 하나"
 * 단위(grapheme)로 세야 정확하다.
 */
function limitEmoji(text: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(text)].map((s) => s.segment);
  return graphemes.slice(0, 3).join("");
}

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
  dayOfMonth,
  isToday,
  numberColorClass,
  className,
  style,
  children,
}: {
  date: string;
  href: string;
  selected: boolean;
  /** 날짜 숫자는 서버(Cell)가 계산해 값만 넘긴다 — 이모지를 그 옆 같은 줄에
      나란히 그리려면 이 컴포넌트가 직접 배지를 그려야 하기 때문이다. */
  dayOfMonth: number;
  isToday: boolean;
  numberColorClass: string;
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
    // 입력 중(onChange)에 자르지 않는다 — 윈도우 이모지 선택 창은 문자를 여러 단계로
    // 조합해서 넣는데, 그 중간에 값을 강제로 바꾸면 조합이 깨져 서로게이트 페어가
    // 반쪽만 남는 등 훨씬 지저분한 값이 쌓인다. 저장하는 이 순간에만 자른다.
    writeEmoji(date, limitEmoji(emojiDraft));
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
        {/* 이모지는 날짜 숫자와 같은 줄, 같은 높이로 바로 옆에 붙인다 — 따로
            구석에 떠 있으면 "이 날의 표시"라는 연결이 눈에 잘 안 들어온다. */}
        <span className="flex items-center gap-1">
          <span
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full p-0 text-center text-xs font-medium leading-5 ${
              isToday ? "bg-accent text-on-accent" : numberColorClass
            }`}
          >
            {dayOfMonth}
          </span>
          {emoji && (
            <span aria-hidden className="text-sm leading-none">
              {emoji}
            </span>
          )}
        </span>
        {children}
        {noted && (
          <span aria-hidden className="absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
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
                    aria-label="날짜 칸에 표시할 이모지 (최대 3개)"
                    title="최대 3개 · Win + . (마침표) 를 누르면 이모지 선택 창이 뜹니다"
                    className="w-16 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-accent"
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
