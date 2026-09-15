"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";

/**
 * 헤더에 따로따로 있던 켜고/끄는 단추들(황금연휴 · 주차 표시 · 온라인/오프라인 ·
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
const PANEL_OPEN_EVENT = "mg-panel-open";

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
  offline,
  offlineLocked,
  isDesktop,
  reminderOptions,
  reminderSelected,
  hourlyChime,
  startTimeReminder,
}: {
  offline: boolean;
  offlineLocked: boolean;
  isDesktop: boolean;
  reminderOptions: readonly number[];
  reminderSelected: number[];
  hourlyChime: boolean;
  startTimeReminder: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [checkedReminders, setCheckedReminders] = useState(new Set(reminderSelected));
  const [chime, setChime] = useState(hourlyChime);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const weekNum = useSyncExternalStore(subscribeWeekNum, weekNumOn, weekNumOnServer);
  // 주차 표시 로직은 유지하되 현재 설정 팝업에서는 노출하지 않는다.
  void weekNum;
  void applyWeekNum;

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

  useEffect(() => {
    function closeWhenAnotherPanelOpens(event: Event) {
      if ((event as CustomEvent<string>).detail !== "settings") setOpen(false);
    }
    window.addEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
  }, []);

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

  function toggleChime() {
    const next = !chime;
    setChime(next);
    patchSettings({ hourlyChime: next });
  }

  function toggleStartTimeReminder() {
    patchSettings({ startTimeReminder: !startTimeReminder });
  }

  async function testNotification() {
    setBusy(true);
    setNotifyError(null);
    try {
      await invoke("test_notification");
    } catch (error) {
      // Tauri는 Result<T, String> 커맨드가 실패하면 Err 문자열 그대로로
      // reject한다(Error 인스턴스가 아니다) — instanceof Error만 보면 원인이 가려진다.
      const reason =
        error instanceof Error ? error.message : typeof error === "string" ? error : null;
      setNotifyError(reason ? `알림을 띄우지 못했습니다: ${reason}` : "알림을 띄우지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          if (next) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: "settings" }));
          setOpen(next);
        }}
        title="알림 설정"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        ⚙ 알림 설정
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-72 flex-col gap-4 rounded-lg border border-border bg-raised p-3 shadow-lg">
          {/* 데스크톱 설치본은 오프라인 여부가 고정값이라 이 자리에 아예 안 둔다 —
              사내망 웹 배포본(같은 OFFLINE_DEFAULT=1이지만 브라우저로 접속)만 다룬다 */}
          {!isDesktop &&
            (offlineLocked ? (
              <div className="border-b border-border pb-3">
                <p className="text-[11px] font-semibold text-muted">인터넷 연결</p>
                <p className="mt-1 text-[10px] leading-snug text-muted">
                  회사 내부망용이라 온라인 기능은 사용할 수 없습니다.
                </p>
              </div>
            ) : (
              <div className="border-b border-border pb-3">
                <label className="flex items-center justify-between gap-2 text-xs text-foreground">
                  온라인 기능
                  <input
                    type="checkbox"
                    checked={!offline}
                    disabled={busy}
                    onChange={() => patchSettings({ offline: !offline })}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                </label>
                <p className="mt-1 text-[10px] leading-snug text-muted">
                  항공권·숙소·환율·챗봇 기능을 사용합니다.
                </p>
              </div>
            ))}

          {/* 알림 시점은 설치본에만 있는 기능이다 — 웹 배포본엔 이 알림 자체가 없다 */}
          {isDesktop && (
            <>
              <div>
                <h3 className="text-xs font-semibold text-foreground">일정 알림</h3>
                <p className="mt-1 text-[10px] leading-snug text-muted">
                  일정 시작 전에 미리 알림을 받을 시간을 선택하세요.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between gap-2 text-xs text-foreground">
                  시작 시 알림
                  <input
                    type="checkbox"
                    checked={startTimeReminder}
                    disabled={busy}
                    onChange={toggleStartTimeReminder}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                </label>
                {reminderOptions.map((minutes) => (
                  <label
                    key={minutes}
                    className="flex items-center justify-between gap-2 text-xs text-foreground"
                  >
                    {REMINDER_LABELS[minutes] ?? `${minutes}분 전`}
                    <input
                      type="checkbox"
                      checked={checkedReminders.has(minutes)}
                      disabled={busy}
                      onChange={() => toggleReminder(minutes)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                  </label>
                ))}
              </div>

              {checkedReminders.size === 0 && !startTimeReminder && (
                <p className="text-[10px] text-muted">
                  알림 시점을 하나 이상 켜야 일정 알림을 받을 수 있습니다.
                </p>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">휴식 알림</h3>
                  <p className="mt-1 text-[10px] text-muted">앱을 켠 뒤 1시간 간격으로 알려 줍니다.</p>
                </div>
                <input
                  type="checkbox"
                  checked={chime}
                  disabled={busy}
                  onChange={toggleChime}
                  className="h-3.5 w-3.5 shrink-0 accent-accent"
                  aria-label="휴식 알림 (1시간 간격)"
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={testNotification}
                className="w-full rounded-md border border-border px-2 py-1.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
              >
                🔔 알림 테스트
              </button>
              {notifyError && (
                <p className="text-[10px] leading-relaxed text-holiday">{notifyError}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
