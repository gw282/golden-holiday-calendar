"use client";

import type { Event } from "@/lib/events";
import EventItem from "./EventItem";
import type { LeaveTypeOption } from "./leaveDays";

export default function EventList({
  events,
  showDate = true,
  emptyText = "일정이 없습니다.",
  conflictIds,
  leaveTypes,
}: {
  events: Event[];
  showDate?: boolean;
  emptyText?: string;
  /**
   * 시각이 서로 겹치는 일정들의 id. 서버가 계산해 넘긴다 —
   * lib/events의 런타임 함수를 여기서 부르면 @libsql/client가 클라이언트 번들로 끌려온다.
   */
  conflictIds?: number[];
  /** 수정 팝업이 고를 수 있는 휴가 종류 */
  leaveTypes?: LeaveTypeOption[];
}) {
  if (events.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted">{emptyText}</p>;
  }

  const conflicts = new Set(conflictIds ?? []);

  return (
    <ul className="divide-y divide-border">
      {events.map((e) => (
        <EventItem
          key={e.id}
          event={e}
          showDate={showDate}
          conflict={conflicts.has(e.id)}
          leaveTypes={leaveTypes}
        />
      ))}
    </ul>
  );
}
