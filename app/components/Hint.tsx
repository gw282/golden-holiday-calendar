"use client";

import { useEffect, useId, useRef, useState } from "react";

/** 커서를 올린 채 이만큼 버텨야 뜬다. 지나가다 스치는 것과 "이게 뭐지"를 가르는 시간 */
const DELAY_MS = 2000;

/**
 * 머물러야 뜨는 도움말.
 *
 * 브라우저 기본 `title` 툴팁을 안 쓰는 이유 셋:
 * 지연 시간을 정할 수 없고(OS마다 다르다), 줄바꿈·강조가 안 되며,
 * 다크 모드에서 혼자 흰 상자로 뜬다.
 *
 * **키보드로 옮겨 왔을 때는 기다리지 않고 바로 띄운다.** 키보드에는 '올려 두기'가
 * 없어서 2초를 버틸 방법 자체가 없다 — 기다리게 하면 그 사용자에겐 도움말이 없는 셈이다.
 *
 * 감싼 요소에는 `title`을 달지 말 것. 둘 다 뜬다.
 */
export default function Hint({
  text,
  children,
  className = "",
}: {
  /** 한두 문장. 길어지면 툴팁이 아니라 도움말 팝업에 들어갈 내용이다 */
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  /** 떠날 때는 지연을 두지 않는다. 사라지는 것까지 느리면 화면을 가린다 */
  function hide() {
    cancel();
    setOpen(false);
  }

  // 뜬 채로 스크롤하면 툴팁만 제자리에 남는다. 페이지를 벗어나기 전에 접는다
  useEffect(() => cancel, []);

  return (
    <span
      className={`relative inline-flex ${className}`}
      onPointerEnter={(e) => {
        // 터치는 '올려 두기'가 없어 2초를 버틸 수 없다. 손가락에는 반응하지 않는다
        if (e.pointerType !== "mouse") return;
        cancel();
        timer.current = setTimeout(() => setOpen(true), DELAY_MS);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={() => setOpen(true)}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          hide();
        }
      }}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>

      {open && (
        <span
          id={id}
          role="tooltip"
          // 가운데 정렬 + 아래쪽. 감싼 요소가 좁아도 툴팁은 제 폭을 갖도록 max-w로만 묶는다
          className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-50 w-max max-w-[16rem] -translate-x-1/2 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-[11px] leading-relaxed text-muted shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
