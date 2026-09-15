"use client";

import { useSyncExternalStore } from "react";

/**
 * MG쉬지 모드 — 업무 화면(달력)과 힐링 화면(휴가 금고·황금연휴 추천기)을 바꿔 끼운다.
 *
 * ThemeToggle·WeekNumToggle과 같은 패턴이다: 진짜 상태는 `<html>`의 속성 하나
 * (`data-mg-sheoji`)뿐이고, React state로 복제하지 않는다. 두 화면 다 서버가 이미
 * 그려서 page.tsx가 함께 내보내고, globals.css가 이 속성 하나로 어느 쪽을 보여줄지
 * 가른다 — 켤 때마다 새로 계산하지 않는다.
 */
const KEY = "mgSheoji";
const CHANGED = "mgsheojichange";

function isOn(): boolean {
  return document.documentElement.dataset.mgSheoji === "on";
}
function isOnServer(): boolean {
  return false;
}
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

export default function MgSheojiToggle() {
  const on = useSyncExternalStore(subscribe, isOn, isOnServer);

  function apply(next: boolean) {
    const root = document.documentElement;
    if (next) {
      root.dataset.mgSheoji = "on";
      try {
        localStorage.setItem(KEY, "on");
      } catch {
        // 무시 — 이번 세션 안에서는 그대로 적용된다
      }
    } else {
      delete root.dataset.mgSheoji;
      try {
        localStorage.removeItem(KEY);
      } catch {
        // 무시
      }
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => apply(!on)}
      title={on ? "MG쉬지 모드 — 켜짐. 눌러서 업무 화면으로" : "MG쉬지 모드 — 눌러서 휴가 화면으로"}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
        on
          ? "border-leave bg-leave-soft text-leave"
          : "border-border text-muted hover:border-leave hover:text-leave"
      }`}
    >
      <span aria-hidden className="leading-none">🌴</span>
      MG쉬지 모드
    </button>
  );
}
