"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import EventFields, { type EventFieldValues } from "./EventFields";
import type { LeaveTypeOption } from "./leaveDays";
import { parseQuickInput } from "@/lib/quickParse";

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
    repeatMode: "count",
    repeatCount: "8",
    repeatUntil: "",
    isLeave: false,
    leaveTypeId: "",
    leaveDays: "",
    reminderMinutes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [quickText, setQuickText] = useState("");

  /**
   * "내일 오후 3시 팀 회의" 한 줄을 날짜·시각·제목으로 쪼개 아래 필드에 채운다
   * (`lib/quickParse.ts`, 외부 API 없는 순수 정규식 파서). 채우기만 하고 바로
   * 저장하진 않는다 — 파서가 못 알아들은 부분이 있을 수 있어 사람이 한 번 보고
   * 넘기는 편이 안전하다.
   */
  function applyQuick() {
    const text = quickText.trim();
    if (!text) return;
    const parsed = parseQuickInput(text, values.date || defaultDate);
    setValues((v) => ({
      ...v,
      title: parsed.title,
      date: parsed.date,
      allDay: parsed.time === null,
      startTime: parsed.time ?? "",
    }));
    setQuickText("");
  }

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
            ? values.repeatMode === "until" && values.repeatUntil
              ? { freq: values.repeatFreq, until: values.repeatUntil }
              : { freq: values.repeatFreq, count: Number(values.repeatCount) || 1 }
            : null,
          isLeave: values.isLeave,
          leaveTypeId: values.leaveTypeId ? Number(values.leaveTypeId) : null,
          // 비우면 서버가 자동(주말·공휴일 제외)으로 센다
          leaveDays: values.leaveDays === "" ? null : Number(values.leaveDays),
          // 비우면 전역 알림 설정을 따른다 (undefined로 보내 아예 안 건드림)
          reminderMinutes: values.reminderMinutes === "" ? undefined : Number(values.reminderMinutes),
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
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2">
        <input
          type="text"
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyQuick();
            }
          }}
          placeholder="퀵 입력: 내일 오후 3시 팀 회의"
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={applyQuick}
          disabled={busy || !quickText.trim()}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          채우기
        </button>
      </div>

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
