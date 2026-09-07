"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * 온라인 / 오프라인 스위치.
 *
 * 끄면 **밖으로 나가는 기능이 통째로 사라진다** — 항공권·숙소 검색 링크, 환율, 구글 캘린더.
 * 감추기만 하는 것이 아니라 서버가 값을 읽고 **요청 자체를 안 한다**(`lib/settings.ts`).
 *
 * 값은 DB에 있으므로 브라우저를 바꿔도 따라온다. 오프라인으로 쓸 빌드는
 * `OFFLINE_DEFAULT=1`로 띄우면 처음부터 꺼진 채로 시작한다.
 *
 * 테마 토글처럼 아이콘 하나로 줄이지 않고 **글자를 남긴 이유**: 켜고 끄는 것이 무엇인지가
 * 아이콘으로는 전달되지 않는다. 지구본만 보고 '항공권이 사라진다'를 짐작할 사람은 없다.
 */
export default function OfflineToggle({ offline, locked = false }: { offline: boolean; locked?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offline: !offline }),
      });
      if (res.ok) startTransition(() => router.refresh());
    } catch {
      // 못 바꿔도 화면은 그대로 둔다. 다시 누르면 된다
    } finally {
      setBusy(false);
    }
  }

  const online = !offline;

  if (locked) {
    return (
      <span
        title="회사 내부망용 오프라인 버전입니다"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-border" />
        오프라인
      </span>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      onClick={toggle}
      disabled={busy || pending}
      title={
        online
          ? "온라인 — 항공권·숙소·환율·구글 캘린더를 씁니다. 누르면 오프라인으로 바뀝니다"
          : "오프라인 — 밖으로 나가는 기능을 모두 끕니다. 누르면 온라인으로 바뀝니다"
      }
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {/* 상태를 색만으로 알리지 않는다 — 글자가 '온라인/오프라인'을 그대로 말한다.
          동그라미는 그 말을 거드는 것일 뿐이라 작게 둔다 */}
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${online ? "bg-accent" : "bg-border"}`}
      />
      {online ? "온라인" : "오프라인"}
    </button>
  );
}
