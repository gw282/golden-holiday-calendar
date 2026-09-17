"use client";

/**
 * 달력 그리드의 순수 화면 취향 두 가지 — 주차 표시 · 절기 표시.
 * `ThemeToggle`과 같은 방식이다: 진짜 상태는 `<html>` 속성 하나(+ localStorage)에
 * 있고, React state로 복제하지 않는다. CSS가 `[data-*]` 속성으로 보이기/숨기기만
 * 하므로 CalendarGrid(서버 컴포넌트)는 손대지 않고 늘 그대로 그린다.
 *
 * 주 시작 요일(월/일)은 여기 없다 — 그건 화면 취향이 아니라 서버가 주(week) 배열
 * 자체를 다시 짜야 하는 값이라 `lib/settings.ts`의 DB 설정으로 간다.
 */

const WEEK_NUM_KEY = "weekNum";
const WEEK_NUM_CHANGED = "weeknumchange";
const SOLAR_TERM_KEY = "solarTerm";
const SOLAR_TERM_CHANGED = "solartermchange";

export function weekNumOn(): boolean {
  return document.documentElement.dataset.weekNum !== "off";
}
export function weekNumOnServer(): boolean {
  return true;
}
export function subscribeWeekNum(onChange: () => void) {
  window.addEventListener(WEEK_NUM_CHANGED, onChange);
  return () => window.removeEventListener(WEEK_NUM_CHANGED, onChange);
}
export function setWeekNum(on: boolean) {
  const root = document.documentElement;
  if (on) {
    delete root.dataset.weekNum;
    try {
      localStorage.removeItem(WEEK_NUM_KEY);
    } catch {
      // 무시 — 이번 세션 안에서는 그대로 적용된다
    }
  } else {
    root.dataset.weekNum = "off";
    try {
      localStorage.setItem(WEEK_NUM_KEY, "off");
    } catch {
      // 무시
    }
  }
  window.dispatchEvent(new Event(WEEK_NUM_CHANGED));
}

/** 기본은 꺼짐 — 절기는 공휴일보다 훨씬 자주 나와서, 켜고 싶은 사람만 켠다 */
export function solarTermOn(): boolean {
  return document.documentElement.dataset.solarTerm === "on";
}
export function solarTermOnServer(): boolean {
  return false;
}
export function subscribeSolarTerm(onChange: () => void) {
  window.addEventListener(SOLAR_TERM_CHANGED, onChange);
  return () => window.removeEventListener(SOLAR_TERM_CHANGED, onChange);
}
export function setSolarTerm(on: boolean) {
  const root = document.documentElement;
  if (on) {
    root.dataset.solarTerm = "on";
    try {
      localStorage.setItem(SOLAR_TERM_KEY, "on");
    } catch {
      // 무시
    }
  } else {
    delete root.dataset.solarTerm;
    try {
      localStorage.removeItem(SOLAR_TERM_KEY);
    } catch {
      // 무시
    }
  }
  window.dispatchEvent(new Event(SOLAR_TERM_CHANGED));
}
