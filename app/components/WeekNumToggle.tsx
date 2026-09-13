"use client";

import { useSyncExternalStore } from "react";

/** localStorage 키. layout.tsx의 인라인 스크립트도 같은 키를 읽으니 함께 고칠 것 */
const KEY = "weekNum";
const CHANGED = "weeknumchange";

function readOn(): boolean {
  return document.documentElement.dataset.weekNum !== "off";
}

function serverOn(): boolean {
  return true;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/**
 * 달력 왼쪽 주차(ISO week) 표시 on/off. 기본은 켜짐 — 다들 궁금해하는 정보는 아니라서
 * 끄고 싶은 사람만 끄게 둔다. ThemeToggle과 같은 패턴: 진짜 상태는 `<html>` 속성 하나고,
 * CSS(`globals.css`의 `html[data-week-num="off"] .week-num`)가 실제로 숨긴다.
 */
export default function WeekNumToggle() {
  const on = useSyncExternalStore(subscribe, readOn, serverOn);

  function apply(next: boolean) {
    const root = document.documentElement;
    if (next) {
      delete root.dataset.weekNum;
      try {
        localStorage.removeItem(KEY);
      } catch {
        // 무시 — 이번 세션 안에서는 그대로 적용된다
      }
    } else {
      root.dataset.weekNum = "off";
      try {
        localStorage.setItem(KEY, "off");
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
      title={on ? "주차 표시 — 켜짐. 눌러서 끄기" : "주차 표시 — 꺼짐. 눌러서 켜기"}
      // OfflineToggle·RecommendationToggle과 크기·모양을 맞춘다 — 헤더의 켜고/끄는
      // 단추는 전부 같은 표준(테두리 알약 + 점 + 글자)을 쓴다
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${on ? "bg-accent" : "bg-border"}`} />
      주차 표시
    </button>
  );
}
