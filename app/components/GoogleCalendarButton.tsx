"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * 구글 캘린더 연동.
 *
 * 백업(.ics) 옆 맨 아래에 둔다 — 하루에 한 번도 안 누르는 자리다. 붙여 놓기만 하면
 * 알아서 도는 것이 목적이라, 평소에 눈에 띌 이유가 없다.
 *
 * **화면이 열릴 때 조용히 한 번 받아 온다**(`?stale=1`). 마지막 동기화가 30분 안이면
 * 서버가 건너뛰므로, 새로고침을 눌러 댄다고 구글을 그만큼 두드리지는 않는다.
 */

type Conn = {
  connected: boolean;
  configured: boolean;
  email: string;
  calendarId: string;
  calendarName: string;
  lastSyncedAt: string | null;
  calendars?: Array<{ id: string; name: string; primary: boolean }>;
  error?: string;
};

export default function GoogleCalendarButton({
  flash,
}: {
  /**
   * 동의 화면에서 돌아온 결과. **서버(page.tsx)가 쿼리에서 읽어 넘긴다** —
   * 여기서 직접 읽으면 effect 안에서 setState를 하게 되고, 그건 렌더를 한 번 더 돌린다.
   */
  flash?: { kind: "ok" | "error"; msg: string } | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [conn, setConn] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withCalendars = false) => {
    try {
      const res = await fetch(`/api/google${withCalendars ? "?calendars=1" : ""}`);
      if (res.ok) setConn(await res.json());
    } catch {
      // 상태를 못 읽어도 화면이 죽지는 않는다. 단추가 '연결'로 보일 뿐이다
    }
  }, []);

  // 첫 렌더에 상태를 읽고, 연결돼 있으면 오래된 경우에만 받아 온다
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/google").catch(() => null);
      if (!res?.ok || !alive) return;
      const c = (await res.json()) as Conn;
      if (!alive) return;
      setConn(c);
      if (!c.connected) return;

      const synced = await fetch("/api/google/sync?stale=1", { method: "POST" }).catch(() => null);
      if (!synced?.ok || !alive) return;
      const data = (await synced.json()) as { skipped?: boolean; added?: number; removed?: number };
      if (data.skipped || !alive) return;
      // 새로 들어온 게 있을 때만 다시 그린다. 매번 refresh하면 화면이 괜히 깜빡인다
      if ((data.added ?? 0) + (data.removed ?? 0) > 0) startTransition(() => router.refresh());
      load();
    })();
    return () => {
      alive = false;
    };
  }, [load, router]);

  // 연결하고 돌아왔으면 팝업을 열어 결과를 보여 주고, 주소에서 흔적을 지운다.
  // 남겨 두면 새로고침할 때마다 '연결했습니다'가 다시 뜬다.
  useEffect(() => {
    if (!flash) return;
    dialog.current?.showModal();
    // 비동기로 감싼다 — effect 본문에서 곧바로 setState를 부르면 렌더가 한 번 더 돈다
    void (async () => {
      await load(true);
    })();
    const q = new URLSearchParams(window.location.search);
    q.delete("gcal");
    q.delete("gcalMsg");
    const rest = q.toString();
    window.history.replaceState(null, "", rest ? `/?${rest}` : "/");
  }, [flash, load]);

  async function send<T>(path: string, init: RequestInit, okNote: (data: T) => string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(path, init);
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "요청에 실패했습니다.");
        return;
      }
      setNote(okNote(data));
      await load(true);
      startTransition(() => router.refresh());
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const sync = () =>
    send<{ added: number; updated: number; removed: number }>(
      "/api/google/sync",
      { method: "POST" },
      (r) => `받아왔습니다 — 새로 ${r.added}건 · 갱신 ${r.updated}건 · 삭제 ${r.removed}건`,
    );

  const pick = (id: string, name: string) =>
    send<unknown>(
      "/api/google",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      },
      () => `${name} 캘린더로 바꿨습니다. 아래 '지금 받아오기'를 눌러 주세요.`,
    );

  const unlink = () => {
    if (!confirm("연결을 해제합니다. 구글에서 받아 온 일정도 함께 지워집니다.")) return;
    return send<{ removed: number }>(
      "/api/google",
      { method: "DELETE" },
      (r) => `연결을 해제했습니다. 받아 온 일정 ${r.removed}건을 정리했습니다.`,
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNote(null);
          setError(null);
          dialog.current?.showModal();
          load(true);
        }}
        className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        구글 캘린더
        {conn?.connected && <span className="ml-1 text-accent">·  연결됨</span>}
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        aria-labelledby="gcal-title"
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-left text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="gcal-title" className="text-sm font-semibold">
            구글 캘린더
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 text-xs">
          {conn && !conn.configured ? (
            <p className="leading-relaxed text-muted">
              먼저 <span className="text-foreground">.env.local</span>에{" "}
              <span className="text-foreground">GOOGLE_CLIENT_ID</span>와{" "}
              <span className="text-foreground">GOOGLE_CLIENT_SECRET</span>을 넣고 개발 서버를 다시
              띄워 주세요. 만드는 곳은 구글 클라우드 콘솔 &gt; API 및 서비스 &gt; 사용자 인증
              정보입니다.
            </p>
          ) : conn?.connected ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">{conn.email || "연결됨"}</span>
                <span className="ml-auto text-muted">
                  {conn.lastSyncedAt ? `마지막 ${fmtWhen(conn.lastSyncedAt)}` : "아직 안 받아옴"}
                </span>
              </div>

              {conn.calendars && conn.calendars.length > 0 && (
                <label className="flex items-center gap-2 text-muted">
                  캘린더
                  <select
                    value={conn.calendarId}
                    onChange={(e) => {
                      const opt = conn.calendars?.find((c) => c.id === e.target.value);
                      if (opt) pick(opt.id, opt.name);
                    }}
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [&>option]:bg-surface"
                  >
                    {conn.calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.primary ? " (기본)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <p className="leading-relaxed text-muted">
                구글에서 <span className="text-foreground">가져오기만</span> 합니다. 받아 온 일정은
                다음 동기화 때 구글 쪽 내용으로 덮이므로 여기서 고치지 마세요. 반복 일정은 구글이
                회차별로 펼쳐 줍니다.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={sync}
                  disabled={busy}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
                >
                  {busy ? "받는 중…" : "지금 받아오기"}
                </button>
                <button
                  type="button"
                  onClick={unlink}
                  disabled={busy}
                  className="ml-auto rounded-lg px-2 py-1.5 text-xs text-muted hover:text-red-500 disabled:opacity-50"
                >
                  연결 해제
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="leading-relaxed text-muted">
                회사·개인 캘린더를 붙이면 그 일정이 달력에 함께 보입니다. 구글에서{" "}
                <span className="text-foreground">가져오기만</span> 하며, 이 앱의 일정을 구글로
                보내지는 않습니다.
              </p>
              <a
                href="/api/google/auth"
                className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent"
              >
                구글 계정 연결
              </a>
            </>
          )}

          {(note ?? (flash?.kind === "ok" ? flash.msg : null)) && (
            <p className="text-accent">{note ?? flash?.msg}</p>
          )}
          {(error ?? (flash?.kind === "error" ? flash.msg : null)) && (
            <p className="text-red-500">{error ?? flash?.msg}</p>
          )}
          {conn?.error && <p className="text-red-500">{conn.error}</p>}
        </div>
      </dialog>
    </>
  );
}

/** SQLite `datetime('now')`는 UTC 'YYYY-MM-DD HH:MM:SS' — 현지 시각으로 바꿔 보여 준다 */
function fmtWhen(at: string): string {
  const ms = Date.parse(`${at.replace(" ", "T")}Z`);
  if (Number.isNaN(ms)) return at;
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}시간 전`;
  return new Date(ms).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}
