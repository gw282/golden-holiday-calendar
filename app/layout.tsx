import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "황금연휴 캘린더",
  description: "연차 하루를 놓아 연휴를 건넙니다 — 달력 · 일정 · 연휴 추천을 한 화면에",
};

/**
 * 저장해 둔 테마를 첫 페인트 전에 <html>에 붙인다.
 * React가 하이드레이션할 때까지 기다리면 라이트로 한 번 그렸다가 다크로 바뀌어 번쩍인다.
 * localStorage 키는 ThemeToggle과 같은 "theme"이니 한쪽만 고치지 말 것.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** 저장해 둔 화면 확대 배율도 같은 이유로 첫 페인트 전에 붙인다. ZoomToggle과 같은 "zoom" 키다 */
const ZOOM_SCRIPT = `try{var z=localStorage.getItem("zoom");if(z==="125"||z==="150")document.documentElement.style.zoom=z+"%"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 위 스크립트가 서버 HTML에 없던 data-theme을 붙이므로 하이드레이션 경고를 끈다
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: ZOOM_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
