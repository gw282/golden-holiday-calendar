"use client";

import { useState } from "react";

/**
 * 그 날 일정을 업무 보고용 텍스트로 클립보드에 복사한다.
 * 줄은 서버(page.tsx)가 이미 "- 9/25(금): 주간 회의, 인사평가 마감" 형식으로
 * 만들어 넘긴다 — 클라이언트는 합쳐서 복사하는 일만 한다.
 *
 * 오른쪽 '그 날 일정' 칸에 붙는 단추라 그 칸이 보여 주는 날짜 하나만 다룬다.
 * 한때 주간(그 날이 속한 주 전체)으로 묶었는데, 이 칸엔 하루치만 보이는데
 * 다른 요일 것까지 같이 복사돼 자리와 내용이 어긋났다.
 */
export default function CopyDayButton({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);

  // 그 날 일정이 하나도 없으면 눌러도 빈 문자열만 복사된다 — 그런 단추는 안 둔다.
  if (lines.length === 0) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드 권한이 없는 드문 환경 — 조용히 두고 다시 눌러 보게 한다
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="이 날 일정을 업무 보고용 텍스트로 복사"
      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
    >
      {copied ? "복사됨" : "일정 복사"}
    </button>
  );
}
