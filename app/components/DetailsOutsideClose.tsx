"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * <details>를 감싸 바깥 클릭·Esc로 닫히게 한다.
 *
 * 네이티브 <details>는 안에서 요소를 눌러야만(브라우저가 자동으로 처리하는 건
 * 없다) 닫히고, 바깥을 누르거나 Esc를 눌러도 그대로 열려 있다 — 그런데 화면
 * 문구는 "Esc로 닫기"라고 적어 놨었다. 열림 상태는 여전히 DOM(<details open>)이
 * 그대로 갖고 있다 — 리액트 state로 복제하지 않고, 그 네이티브 속성만 끈다.
 * 안의 내용(summary·본문)은 서버가 이미 다 그려서 children으로 그대로 받는다.
 */
export default function DetailsOutsideClose({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close() {
      if (ref.current) ref.current.open = false;
    }
    function onDocClick(e: MouseEvent) {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && ref.current?.open) close();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
