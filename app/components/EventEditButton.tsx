"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/events";
import EventFields, { type EventFieldValues } from "./EventFields";
import type { LeaveTypeOption } from "./leaveDays";

function toValues(event: Event): EventFieldValues {
  return {
    title: event.title,
    date: event.date,
    // 하루짜리는 종료일 칸을 비워 둔다 — 굳이 같은 날짜를 두 번 보여 줄 이유가 없다
    endDate: event.endDate > event.date ? event.endDate : "",
    allDay: event.startTime === null,
    startTime: event.startTime ?? "",
    endTime: event.endTime ?? "",
    memo: event.memo,
    color: event.color,
    // 반복은 만들 때만 정한다. 여기서는 쓰지 않지만 타입을 맞추려고 둔다.
    repeatFreq: "",
    repeatCount: "1",
    isLeave: event.isLeave,
    leaveTypeId: event.leaveTypeId === null ? "" : String(event.leaveTypeId),
    // null은 '자동'이라 칸을 비워 둔다. 자동값을 적어 넣으면 직접 입력으로 굳어 버려서
    // 나중에 날짜를 옮겨도 옛 숫자가 따라다닌다.
    leaveDays: event.leaveDays === null ? "" : String(event.leaveDays),
  };
}

/**
 * 일정 수정 팝업.
 *
 * 예전에는 목록 안에서 인라인으로 고쳤는데 제목·날짜 두 개만 보내고 있었다.
 * 시간·메모까지 넣으면 좁은 칸에서 줄바꿈이 심해져서, 추가 폼과 같은 `<dialog>`로 옮기고
 * 입력은 `EventFields`로 공유한다.
 */
export default function EventEditButton({
  event,
  leaveTypes,
}: {
  event: Event;
  leaveTypes?: LeaveTypeOption[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [values, setValues] = useState<EventFieldValues>(toValues(event));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function open() {
    // 열 때마다 서버가 준 최신 값으로 되돌린다 (닫고 다시 열면 편집 중이던 값은 버린다)
    setValues(toValues(event));
    setError(null);
    dialog.current?.showModal();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          date: values.date,
          endDate: values.endDate || null,
          startTime: values.allDay ? null : values.startTime || null,
          endTime: values.allDay ? null : values.endTime || null,
          memo: values.memo,
          color: values.color || null,
          isLeave: values.isLeave,
          leaveTypeId: values.leaveTypeId ? Number(values.leaveTypeId) : null,
          leaveDays: values.leaveDays === "" ? null : Number(values.leaveDays),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "저장하지 못했습니다.");
        return;
      }

      startTransition(() => router.refresh());
      dialog.current?.close();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || pending;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md px-2 py-1 text-xs text-muted hover:bg-accent-soft hover:text-accent"
      >
        수정
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-left text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">일정 수정</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
          <EventFields value={values} onChange={setValues} disabled={busy} leaveTypes={leaveTypes} />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
