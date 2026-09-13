"use client";

/**
 * 날짜별 한 줄 메모 — 서버/DB를 거치지 않는다.
 * `lib/events.ts`를 client에서 import하면 안 되는 규칙과 별개로, 이건 애초에
 * DB에 넣을 생각이 없는 개인용 낙서장이다(회의 시각 메모 같은 것). PC를 껐다 켜도
 * 남아 있어야 하니 localStorage에 그대로 둔다.
 *
 * `ThemeToggle.tsx`와 같은 `useSyncExternalStore` 구독 패턴 — 진짜 상태는
 * localStorage에 있고, 이 파일은 그걸 읽고/쓰고/바뀜을 알리기만 한다.
 */
const KEY = "local-day-notes";
const CHANGED = "localnoteschange";

type NoteMap = Record<string, string>;

function readAll(): NoteMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as NoteMap) : {};
  } catch {
    // 파싱 실패(손상된 값)나 접근 불가(프라이빗 창) — 메모가 없는 것으로 취급한다
    return {};
  }
}

function writeAll(notes: NoteMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // 저장 실패해도 화면은 계속 써야 한다 — 이 앱의 나머지는 메모와 무관하다
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function readNote(date: string): string {
  return readAll()[date] ?? "";
}

/** 빈 문자열로 저장하면 그 날짜 키 자체를 지운다 — 빈 메모가 계속 쌓이지 않게 */
export function writeNote(date: string, text: string) {
  const notes = readAll();
  if (text.trim() === "") delete notes[date];
  else notes[date] = text;
  writeAll(notes);
}

export function hasNote(date: string): boolean {
  return readNote(date) !== "";
}

export function subscribeNotes(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}
