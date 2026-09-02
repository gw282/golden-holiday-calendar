"use client";

import { useRef } from "react";
import EventForm from "./EventForm";
import type { LeaveTypeOption } from "./leaveDays";
import { ADD_EVENT_BUTTON_ID } from "./Shortcuts";

/**
 * 일정 추가 팝업.
 *
 * 브라우저 기본 `<dialog>` + `showModal()`을 쓴다. 포커스 트랩, ESC로 닫기,
 * 뒤쪽 내용 비활성화(inert)를 브라우저가 처리해 줘서 손으로 만든 모달보다 짧고 정확하다.
 * 백드롭 클릭만 직접 붙인다 — 그건 기본 동작이 아니다.
 */
export default function AddEventButton({
  defaultDate,
  leaveTypes,
}: {
  defaultDate: string;
  leaveTypes?: LeaveTypeOption[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        id={ADD_EVENT_BUTTON_ID}
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
      >
        + 일정 추가
      </button>

      <dialog
        ref={dialog}
        // 백드롭을 누르면 target이 dialog 자신이다. 안쪽을 누르면 자식이 target이라 안 닫힌다.
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">새 일정 추가</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {/* 선택한 날짜가 바뀌면 폼을 새 기본값으로 다시 마운트한다 */}
          <EventForm
            key={defaultDate}
            defaultDate={defaultDate}
            leaveTypes={leaveTypes}
            onSaved={() => dialog.current?.close()}
          />
        </div>
      </dialog>
    </>
  );
}
