"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * 황금연휴 추천 켜고 끄기. `OfflineToggle.tsx`와 같은 패턴 — 값은 DB(app_settings)에
 * 있어서 껐다 켜도 다음에 열 때 기억한다. 꺼 두면 page.tsx가 후보 계산 자체를
 * 건너뛴다(감추기만 하는 게 아니다).
 */
export default function RecommendationToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendations: !enabled }),
      });
      if (res.ok) startTransition(() => router.refresh());
    } catch {
      // 못 바꿔도 화면은 그대로 둔다. 다시 누르면 된다
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      disabled={busy || pending}
      title={
        enabled
          ? "황금연휴 추천 — 켜짐. 누르면 꺼집니다(계산도 멈춥니다)"
          : "황금연휴 추천 — 꺼짐. 누르면 다시 켜집니다"
      }
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-accent" : "bg-border"}`}
      />
      연휴 추천
    </button>
  );
}
