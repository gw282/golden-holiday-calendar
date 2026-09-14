"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * 헤더에 따로따로 있던 켜고/끄는 단추들(황금연휴 추천 · 주차 표시 · 온라인/오프라인 ·
 * 알림 시점)을 하나의 "설정" 팝업으로 모았다. 하나씩 알약 단추로 늘어놓으니 헤더가
 * 좁은 화면에서 줄바꿈이 잦고, 뭐가 기능 토글이고 뭐가 테마·확대 같은 화면 설정인지
 * 구분도 안 됐다 — 여기 모인 건 전부 **DB나 localStorage에 저장되는 기능 on/off**다.
 *
 * 각 항목의 저장 방식은 원래 있던 단추들(RecommendationToggle·WeekNumToggle·
 * OfflineToggle·ReminderSettings)과 똑같다 — 그 컴포넌트들의 로직을 그대로 옮겨 왔다.
 * 주차 표시만 `<html>` 속성 + localStorage(서버를 안 거친다)이고, 나머지 셋은
 * `/api/settings` PATCH 후 `router.refresh()`로 서버 컴포넌트를 다시 그린다.
 */

const WEEK_NUM_KEY = "weekNum";
const WEEK_NUM_CHANGED = "weeknumchange";

function weekNumOn(): boolean {
  return document.documentElement.dataset.weekNum !== "off";
}
function weekNumOnServer(): boolean {
  return true;
}
function subscribeWeekNum(onChange: () => void) {
  window.addEventListener(WEEK_NUM_CHANGED, onChange);
  return () => window.removeEventListener(WEEK_NUM_CHANGED, onChange);
}

const REMINDER_LABELS: Record<number, string> = {
  15: "15분 전",
  30: "30분 전",
  60: "1시간 전",
  120: "2시간 전",
};

export default function SettingsPanel({
  recsEnabled,
  offline,
  offlineLocked,
  isDesktop,
  reminderOptions,
  reminderSelected,
}: {
  recsEnabled: boolean;
  offline: boolean;
  offlineLocked: boolean;
  isDesktop: boolean;
  reminderOptions: readonly number[];
  reminderSelected: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [checkedReminders, setCheckedReminders] = useState(new Set(reminderSelected));
  const rootRef = useRef<HTMLDivElement>(null);
  const weekNum = useSyncExternalStore(subscribeWeekNum, weekNumOn, weekNumOnServer);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applyWeekNum(next: boolean) {
    const root = document.documentElement;
    if (next) {
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

  async function patchSettings(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) startTransition(() => router.refresh());
    } catch {
      // 못 바꿔도 화면은 그대로 둔다. 다시 누르면 된다
    } finally {
      setBusy(false);
    }
  }

  function toggleReminder(minutes: number) {
    const next = new Set(checkedReminders);
    if (next.has(minutes)) next.delete(minutes);
    else next.add(minutes);
    setCheckedReminders(next);
    patchSettings({ reminderThresholds: [...next] });
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="설정"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        ⚙ 설정
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-60 flex-col gap-3 rounded-lg border border-border bg-raised p-3 shadow-lg">
          <label className="flex items-center justify-between gap-2 text-xs text-foreground">
            황금연휴 추천
            <input
              type="checkbox"
              checked={recsEnabled}
              disabled={busy}
              onChange={() => patchSettings({ recommendations: !recsEnabled })}
              className="h-3.5 w-3.5 accent-accent"
            />
          </label>

          <label className="flex items-center justify-between gap-2 text-xs text-foreground">
            달력 주차 표시
            <input
              type="checkbox"
              checked={weekNum}
              onChange={() => applyWeekNum(!weekNum)}
              className="h-3.5 w-3.5 accent-accent"
            />
          </label>

          {/* 데스크톱 설치본은 오프라인 여부가 고정값이라 이 자리에 아예 안 둔다 —
              사내망 웹 배포본(같은 OFFLINE_DEFAULT=1이지만 브라우저로 접속)만 다룬다 */}
          {!isDesktop &&
            (offlineLocked ? (
              <p className="text-[11px] text-muted">
                오프라인 — 회사 내부망용이라 항상 꺼져 있습니다
              </p>
            ) : (
              <label className="flex items-center justify-between gap-2 text-xs text-foreground">
                온라인 (항공권·숙소·환율·구글)
                <input
                  type="checkbox"
                  checked={!offline}
                  disabled={busy}
                  onChange={() => patchSettings({ offline: !offline })}
                  className="h-3.5 w-3.5 accent-accent"
                />
              </label>
            ))}

          {/* 알림 시점은 설치본에만 있는 기능이다 — 웹 배포본엔 이 알림 자체가 없다 */}
          {isDesktop && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
              <span className="text-[11px] text-muted">일정 알림 시점</span>
              {reminderOptions.map((minutes) => (
                <label
                  key={minutes}
                  className="flex items-center gap-2 text-xs text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={checkedReminders.has(minutes)}
                    disabled={busy}
                    onChange={() => toggleReminder(minutes)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  {REMINDER_LABELS[minutes] ?? `${minutes}분 전`}
                </label>
              ))}
              {checkedReminders.size === 0 && (
                <p className="text-[10px] text-muted">전부 끄면 알림이 안 옵니다.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
