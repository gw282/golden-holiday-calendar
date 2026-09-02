"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/events";
import { addDays, formatKo, formatShortKo } from "@/lib/date";
import { colorHex } from "@/lib/eventColors";
import EventEditButton from "./EventEditButton";
import EventChecklist from "./EventChecklist";
import { countWorkdays, fmtDays, useHolidayDates, type LeaveTypeOption } from "./leaveDays";

export default function EventItem({
  event,
  showDate,
  conflict = false,
  leaveTypes = [],
}: {
  event: Event;
  showDate: boolean;
  /** 같은 날 다른 일정과 시각이 겹친다 */
  conflict?: boolean;
  leaveTypes?: LeaveTypeOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 준비물은 접힌 채로 시작한다. 목록에 기간 일정이 여러 건이면 다 펼쳐져 화면을 덮는다.
  const [showTasks, setShowTasks] = useState(false);
  // 연차 배지에 '자동' 일수를 적으려면 공휴일이 필요하다 (모듈이 한 번만 받아 캐시한다)
  const holidays = useHolidayDates();

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "저장하지 못했습니다.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * 하루씩 밀거나 당긴다. 시작일만 보내면 서버가 **기간(일수)을 유지한 채**
   * 종료일도 같이 옮겨 주므로 여기서 계산할 것이 없다.
   */
  const shiftDate = (days: number) => patch({ date: addDays(event.date, days) });

  async function remove(series = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${event.id}${series ? "?series=1" : ""}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("삭제하지 못했습니다.");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const dimmed = busy || pending;
  const multiDay = event.endDate > event.date;

  // 연차 일수. null이면 '자동'이라 여기서 세어 보여 준다 — 서버가 잔고를 낼 때 쓰는 규칙과 같다.
  // 종류가 여럿이면 배지에 이름을 적어야 어느 휴가를 쓴 건지 알 수 있다
  const leaveName =
    leaveTypes.find((t) => t.id === event.leaveTypeId)?.name ?? leaveTypes[0]?.name ?? "휴가";
  const leaveLabel = fmtDays(
    event.leaveDays ?? countWorkdays(event.date, event.endDate, holidays),
  );
  /** 기간 일정은 종료일까지 같이 밀리므로 그 사실을 말로 적어 준다 */
  const shiftHint = multiDay ? " (기간 유지, 종료일도 같이 이동)" : "";

  return (
    <li
      className={`flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 ${
        dimmed ? "opacity-50" : ""
      }`}
    >
      {/* 색은 점이 아니라 **세로 바**로 준다. 점은 제목 줄 안에 섞여 다른 배지와
          경쟁하는데, 세로 바는 줄 왼쪽 끝에 붙어 목록을 훑을 때 같은 색끼리 묶여 보인다.
          완료한 것은 테두리색으로 죽여 색이 눈길을 끌지 않게 한다.
          Tailwind 클래스를 문자열로 조립하면 빌드 때 못 찾으므로 hex + inline style이다 */}
      <span
        aria-hidden
        className="mt-0.5 w-[3px] shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: event.done ? "var(--border)" : colorHex(event.color) }}
      />

      <input
        type="checkbox"
        checked={event.done}
        onChange={(e) => patch({ done: e.target.checked })}
        disabled={dimmed}
        aria-label={`${event.title} 완료 표시`}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {event.startTime ? (
            <span className="font-mono text-xs text-accent">
              {event.startTime}
              {event.endTime && `~${event.endTime}`}
            </span>
          ) : (
            <span className="text-[11px] text-muted">하루 종일</span>
          )}
          {showDate ? (
            // 팝업(검색·다가오는 일정)에서 일정을 고르면 팝업이 닫히고 달력이 그 날로 옮겨진다.
            // 제목까지 링크에 넣는 이유: 날짜 글자만 누르게 하면 과녁이 너무 작다.
            // 서버의 href 빌더는 함수라 클라이언트로 넘길 수 없어 주소를 여기서 직접 만든다.
            <Link
              href={`/?month=${event.date.slice(0, 7)}&date=${event.date}`}
              title="이 날로 이동"
              // 어느 팝업 안에 있는지는 DOM이 이미 안다. 콜백을 prop으로 받으면
              // 서버 컴포넌트에서 쓰는 EventList에도 함수를 넘겨야 해서(서버 → 클라이언트
              // 함수 전달은 불가) 구조가 번진다.
              onClick={(e) => e.currentTarget.closest("dialog")?.close()}
              className="group flex min-w-0 flex-wrap items-baseline gap-x-2"
            >
              <span
                className={`text-[15px] ${
                  event.done ? "text-muted line-through" : "text-foreground"
                } group-hover:text-accent`}
              >
                {event.title}
              </span>
              <span className="text-xs text-muted underline decoration-dotted group-hover:text-accent">
                · {formatKo(event.date)}
              </span>
            </Link>
          ) : (
            <span
              className={`text-[15px] ${event.done ? "text-muted line-through" : "text-foreground"}`}
            >
              {event.title}
            </span>
          )}
          {/* lib/events의 런타임 함수를 import하면 @libsql/client가 클라이언트 번들로 끌려온다 */}
          {event.endDate > event.date && (
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">
              {formatShortKo(event.date)} ~ {formatShortKo(event.endDate)}
            </span>
          )}
          {/* 막지 않고 알리기만 한다. 하루에 두 탕 뛰는 날은 실제로 있고,
              무엇과 겹치는지는 같은 목록 안에서 시각을 보면 바로 안다 */}
          {conflict && (
            <span
              title="같은 날 다른 일정과 시각이 겹칩니다"
              className="rounded bg-holiday/10 px-1.5 py-0.5 text-[11px] font-medium text-holiday"
            >
              시간 겹침
            </span>
          )}
          {event.isLeave && (
            <span
              title="휴가 잔고에서 빠지는 일수"
              className="rounded bg-leave-soft px-1.5 py-0.5 text-[11px] font-medium text-leave"
            >
              {leaveName} {leaveLabel}일
            </span>
          )}
        </div>
        {event.memo && <p className="mt-0.5 text-xs text-muted">{event.memo}</p>}

        {/* 준비물은 기간 일정에만 둔다. 하루짜리에 붙이면 모든 줄에 버튼이 하나 더 생기는데,
            챙길 것이 생기는 일정은 대개 여행·출장처럼 며칠에 걸친 것들이다 */}
        {multiDay && (
          <>
            <button
              type="button"
              onClick={() => setShowTasks((v) => !v)}
              aria-expanded={showTasks}
              className="mt-1 rounded px-1 py-0.5 text-[11px] text-muted underline decoration-dotted hover:text-accent"
            >
              준비물
              {event.tasksTotal > 0 ? (
                <span
                  className={`ml-1 font-medium ${
                    event.tasksDone === event.tasksTotal ? "text-accent" : "text-foreground"
                  }`}
                >
                  {event.tasksDone}/{event.tasksTotal}
                </span>
              ) : (
                <span className="ml-0.5">+</span>
              )}
            </button>
            {showTasks && <EventChecklist eventId={event.id} />}
          </>
        )}

        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* 하루 미루기가 가장 잦은 수정이라 팝업을 열지 않고 여기서 끝낸다 */}
        <button
          onClick={() => shiftDate(-1)}
          disabled={dimmed}
          title={`하루 당기기 — 날짜를 하루 앞으로${shiftHint}`}
          aria-label={`${event.title} 하루 당기기`}
          className="rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-accent-soft hover:text-accent"
        >
          −1일
        </button>
        <button
          onClick={() => shiftDate(1)}
          disabled={dimmed}
          title={`하루 미루기 — 날짜를 하루 뒤로${shiftHint}`}
          aria-label={`${event.title} 하루 미루기`}
          className="rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-accent-soft hover:text-accent"
        >
          +1일
        </button>
        <EventEditButton event={event} leaveTypes={leaveTypes} />
        <button
          onClick={() => remove(false)}
          disabled={dimmed}
          aria-label={`${event.title} 삭제`}
          className="rounded-md px-2 py-1 text-xs text-muted hover:bg-red-500/10 hover:text-red-500"
        >
          삭제
        </button>
        {event.seriesId && (
          // 반복으로 만든 묶음은 한 건씩 지우면 끝이 없어서 전체 삭제를 따로 둔다.
          // **이것만 확인을 받는다** — 한 번 누르면 최대 60건이 되돌릴 수 없이 사라지는데
          // 바로 옆의 '하루 미루기'와 크기·간격이 같아 잘못 누르기 쉽다.
          // 단건 삭제까지 확인을 걸면 가장 잦은 조작이 매번 두 번이 되어 오히려 성가시다.
          <button
            onClick={() => {
              if (confirm(`'${event.title}' 반복 일정을 전부 지웁니다. 되돌릴 수 없습니다.`)) {
                remove(true);
              }
            }}
            disabled={dimmed}
            title="이 반복 일정 전체 삭제"
            aria-label={`${event.title} 반복 전체 삭제`}
            className="rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-red-500/10 hover:text-red-500"
          >
            반복 전체
          </button>
        )}
      </div>
    </li>
  );
}
