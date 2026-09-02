"use client";

import { useRef } from "react";
import type { Event } from "@/lib/events";
import EventList from "./EventList";

/**
 * 다가오는 일정 전체를 팝업으로 보여 준다.
 *
 * 한 줄 스트립은 가까운 5건만 담는다. 나머지를 그 줄에 펼치면 가로로 길어져
 * 스크롤해야 읽히는데, 팝업은 세로로 쌓여 한눈에 들어오고 완료·수정·삭제까지 그대로 쓸 수 있다.
 */
export default function UpcomingMoreButton({
  events,
  hiddenCount,
  days,
}: {
  /** 4주치 전부 (앞의 5건도 포함해서 넘긴다 — 팝업에서는 전체를 보여 준다) */
  events: Event[];
  /** 스트립에 안 보이는 건수 — 버튼 글자에 쓴다 */
  hiddenCount: number;
  /** 몇 주치인지 안내에 쓸 날수 */
  days: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-md px-2 py-0.5 text-xs text-muted underline decoration-dotted hover:text-accent"
      >
        더보기 +{hiddenCount}
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        aria-labelledby="upcoming-dialog-title"
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-left text-foreground shadow-lg backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="upcoming-dialog-title" className="text-sm font-semibold">
            다가오는 일정{" "}
            <span className="font-normal text-muted">
              앞으로 {days / 7}주 · {events.length}건
            </span>
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

        {/* 건수가 많아도 팝업 안에서만 스크롤한다 */}
        <div className="max-h-[70vh] overflow-y-auto">
          <EventList events={events} emptyText="다가오는 일정이 없습니다." />
        </div>
      </dialog>
    </>
  );
}
