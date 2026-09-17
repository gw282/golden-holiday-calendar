import type { Metadata } from "next";
import "./globals.css";
import BirdsBackground from "./components/BirdsBackground";

export const metadata: Metadata = {
  title: "MG 매니지",
  description: "일정과 연차를 한 화면에서 관리하는 캘린더 — 반복 일정, 휴가 잔고, 황금 연휴 추천까지",
};

/**
 * 저장해 둔 테마를 첫 페인트 전에 <html>에 붙인다.
 * React가 하이드레이션할 때까지 기다리면 라이트로 한 번 그렸다가 다크로 바뀌어 번쩍인다.
 * localStorage 키는 ThemeToggle과 같은 "theme"이니 한쪽만 고치지 말 것.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * 저장해 둔 화면 확대 배율도 같은 이유로 첫 페인트 전에 붙인다. ZoomToggle과 같은 "zoom" 키다.
 * 화이트리스트는 ZoomToggle.tsx의 ZOOM_LEVELS와 같은 값이어야 한다 — 임의 문자열이
 * 그대로 CSS에 꽂히지 않도록 여기서도 한 번 더 허용 목록으로 막는다.
 */
const ZOOM_SCRIPT = `try{var z=localStorage.getItem("zoom");if(["50","75","125","150","175","200"].indexOf(z)>=0){document.documentElement.style.zoom=z+"%";document.documentElement.style.setProperty("--app-zoom",(+z/100))}}catch(e){}`;

/** 주차 표시 on/off도 같은 이유로 첫 페인트 전에 붙인다. CalendarSettingsButton과 같은 "weekNum" 키다 */
const WEEK_NUM_SCRIPT = `try{if(localStorage.getItem("weekNum")==="off")document.documentElement.dataset.weekNum="off"}catch(e){}`;

/** 절기 표시 on/off도 같은 이유로 첫 페인트 전에 붙인다. 기본은 꺼짐이라 "on"일 때만 켠다 */
const SOLAR_TERM_SCRIPT = `try{if(localStorage.getItem("solarTerm")==="on")document.documentElement.dataset.solarTerm="on"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 위 스크립트가 서버 HTML에 없던 data-theme을 붙이므로 하이드레이션 경고를 끈다
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: ZOOM_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: WEEK_NUM_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SOLAR_TERM_SCRIPT }} />
        <BirdsBackground />
        {children}
      </body>
    </html>
  );
}
