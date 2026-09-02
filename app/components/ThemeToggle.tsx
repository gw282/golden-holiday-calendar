"use client";

import { useSyncExternalStore } from "react";

/** localStorage 키. layout.tsx의 인라인 스크립트도 같은 키를 읽으니 함께 고칠 것 */
const KEY = "theme";
/** 버튼이 <html>을 고쳤다고 자기 자신에게 알리는 이벤트 */
const CHANGED = "themechange";

type Theme = "system" | "light" | "dark";

/** 누를 때마다 시스템 → 라이트 → 다크 → 시스템으로 돈다.
 *  버튼 하나로 끝나서 헤더에 드롭다운을 달지 않아도 된다 */
const NEXT: Record<Theme, Theme> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const FACE: Record<Theme, { icon: string; label: string }> = {
  system: { icon: "◐", label: "시스템 설정" },
  light: { icon: "☀", label: "라이트" },
  dark: { icon: "☾", label: "다크" },
};

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/** 진짜 상태는 <html data-theme>이다. useState로 복제하지 않고 그걸 그대로 읽는다 —
 *  layout의 인라인 스크립트가 이미 값을 넣어 둬서 첫 렌더부터 맞다 */
function readTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

/** 서버에는 DOM이 없다. 저장된 값을 알 수 없으니 기본값으로 그린다 */
function serverTheme(): Theme {
  return "system";
}

/**
 * 테마 전환 버튼.
 *
 * 실제 색은 CSS가 정한다 — 이 버튼은 <html>의 data-theme 속성만 붙였다 뗀다.
 * 속성이 없으면 globals.css의 `color-scheme: light dark`가 OS 설정을 따르므로,
 * '시스템 설정' 상태는 곧 속성을 지운 상태다.
 */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  function apply(next: Theme) {
    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
      localStorage.removeItem(KEY);
    } else {
      root.dataset.theme = next;
      localStorage.setItem(KEY, next);
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  const face = FACE[theme];

  return (
    <button
      type="button"
      onClick={() => apply(NEXT[theme])}
      aria-label={`화면 테마: ${face.label}. 눌러서 ${FACE[NEXT[theme]].label}(으)로`}
      title={`화면 테마 — ${face.label}`}
      // HelpButton과 같은 크기·같은 hover로 맞춰 헤더에서 한 벌로 보이게 한다
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] leading-none text-muted hover:border-accent hover:bg-accent-soft hover:text-accent"
    >
      <span aria-hidden>{face.icon}</span>
    </button>
  );
}
