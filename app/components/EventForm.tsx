"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import EventFields, { type EventFieldValues } from "./EventFields";
import type { LeaveTypeOption } from "./leaveDays";

/** 팝업(AddEventButton) 안에서만 쓴다. 바깥 테두리는 dialog가 그리므로 여기선 폼만 그린다. */
export default function EventForm({
  defaultDate,
  onSaved,
  leaveTypes,
}: {
  defaultDate: string;
  /** 고를 수 있는 휴가 종류 (서버가 넘긴다) */
  leaveTypes?: LeaveTypeOption[];
  /** 저장에 성공했을 때. 팝업을 닫는 데 쓴다 */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [values, setValues] = useState<EventFieldValues>({
    title: "",
    date: defaultDate,
    endDate: "",
    allDay: true,
    startTime: "",
    endTime: "",
    memo: "",
    color: "",
    repeatFreq: "",
    repeatCount: "8",
    isLeave: false,
    leaveTypeId: "",
    leaveDays: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          date: values.date,
          endDate: values.endDate || null,
          startTime: values.allDay ? null : values.startTime || null,
          endTime: values.allDay ? null : values.endTime || null,
          memo: values.memo,
          color: values.color || null,
          repeat: values.repeatFreq
            ? { freq: values.repeatFreq, count: Number(values.repeatCount) || 1 }
            : null,
          isLeave: values.isLeave,
          leaveTypeId: values.leaveTypeId ? Number(values.leaveTypeId) : null,
          // 비우면 서버가 자동(주말·공휴일 제외)으로 센다
          leaveDays: values.leaveDays === "" ? null : Number(values.leaveDays),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "일정을 저장하지 못했습니다.");
        return;
      }

      setValues({ ...values, title: "", memo: "", isLeave: false, leaveTypeId: "", leaveDays: "" });
      // DB가 단일 진실 공급원 — Server Component를 다시 그린다
      startTransition(() => router.refresh());
      onSaved?.();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || pending;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <EventFields
        value={values}
        onChange={setValues}
        disabled={busy}
        allowRepeat
        leaveTypes={leaveTypes}
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="self-end rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
      >
        {busy ? "저장 중…" : "추가"}
      </button>
    </form>
  );
}
