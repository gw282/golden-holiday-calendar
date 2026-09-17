"use client";

/**
 * '?' 버튼을 1초 이상 꾹 누르면 켜지는 이스터에그 배경 토글.
 *
 * `localNotes.ts`·`ThemeToggle`과 같은 패턴 — 진짜 상태는 localStorage에 있고,
 * 이 파일은 읽고/쓰고/바뀜을 알리기만 한다. 서버에 남길 이유가 없는(=기능과
 * 무관한 장난) 값이라 DB를 거치지 않는다.
 */
const KEY = "mg-birds-bg";
const CHANGED = "birdsbgchange";

export function readBirdsBg(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function toggleBirdsBg() {
  const next = !readBirdsBg();
  try {
    localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    // 저장이 안 돼도(프라이빗 창 등) 무해한 장난이니 그냥 넘어간다
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeBirdsBg(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}
