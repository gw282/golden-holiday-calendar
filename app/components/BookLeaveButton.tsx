"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** 연차로 찍을 때 쓰는 색 (lib/eventColors.ts의 키) */
const LEAVE_COLOR = "amber";

/**
 * 추천을 실제 일정으로 옮긴다.
 *
 * 연차일만 찍지 않고 **연휴 구간 전체**를 한 건으로 만든다. 그래야 달력에 띠 하나로
 * 이어져 보이고, 10/6·10/7·10/8처럼 흩어진 연차가 여러 줄로 쪼개지지 않는다.
 *
 * 제목을 `연차`가 아니라 `휴가`로 두는 이유: 구간에는 주말·공휴일이 함께 들어 있어서
 * 그 날들까지 `연차`라고 부르면 사실과 다르다. 실제로 낸 연차는 메모에 남긴다.
 *
 * 등록하면 **바로** 그 구간으로 이동한다. 달력·다가오는 일정이 즉시 갱신되고,
 * 오른쪽 패널에 방금 만든 일정이 떠서 잘못 눌렀으면 그 자리에서 지울 수 있다.
 */
export default function BookLeaveButton({
  start,
  end,
  leaveDates,
  note,
  afterHref,
  className = "px-1.5 py-0.5",
}: {
  /** 연휴 구간 */
  start: string;
  end: string;
  /** 실제로 내는 연차 날짜들 — 메모에 남긴다 */
  leaveDates: string[];
  /** 메모에 쓸 요약 (예: '연차 1일 10/2(금) · 4일 연휴') */
  note: string;
  /** 등록 후 이동할 곳 — 그 구간을 고르고 깜빡이게 하는 링크 */
  afterHref: string;
  /**
   * 단추의 크기·여백만 넘겨받는다. 옆에 놓이는 내용의 높이가 부르는 곳마다 달라서다 —
   * 추천 목록의 카드는 두 줄이고 다른 자리는 한 줄이다.
   * 색과 테두리는 넘기지 않는다. 연차 등록은 어디서든 같은 단추여야 한다.
   */
  className?: string;
}) {
  const router = useRouter();
  const button = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function book() {
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "휴가",
          date: start,
          endDate: end,
          startTime: null,
          memo: note,
          color: LEAVE_COLOR,
          isLeave: true,
          // 추천이 이미 어느 날에 내는지 정확히 알고 있으므로 자동 계산에 맡기지 않고 그 수를 준다.
          // (자동은 구간의 평일을 세는데, 추천 구간에는 연차를 안 내는 평일이 섞일 수 있다)
          leaveDays: leaveDates.length,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "연차를 등록하지 못했습니다.");
        return;
      }

      // 팝업(여행 찾기) 안에서 등록했으면 닫아 준다. 등록 결과는 뒤의 달력에 나타나므로
      // 팝업이 계속 떠 있으면 방금 만든 일정을 가린다. 팝업 밖이면 closest가 null이다.
      button.current?.closest("dialog")?.close();

      startTransition(() => {
        router.push(afterHref, { scroll: false });
        // 같은 URL이면 push가 아무 일도 하지 않으므로 갱신을 따로 건다
        router.refresh();
      });
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || pending;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {error && <span className="text-[10px] text-red-500">{error}</span>}
      <button
        ref={button}
        type="button"
        onClick={book}
        disabled={busy}
        title={`${start} ~ ${end} 전체를 휴가로 등록 (연차 ${leaveDates.length}일)`}
        className={`shrink-0 rounded-md border border-leave text-[11px] text-leave transition-colors hover:bg-leave-soft disabled:opacity-50 ${className}`}
      >
        {busy ? "등록 중…" : "연차 등록"}
      </button>
    </span>
  );
}
