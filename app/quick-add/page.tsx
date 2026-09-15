"use client";

import { useEffect, useRef, useState } from "react";
import { parseQuickInput } from "@/lib/quickParse";
import { formatShortKo, today } from "@/lib/date";

/**
 * 전역 퀵 입력창(알프레드/스포트라이트 스타일).
 *
 * `Ctrl+Shift+Space`로 어디서든 뜨는 별도 웹뷰 창("quickadd", src-tauri/src/lib.rs)에
 * 로드된다. 창이 decorations(false)+transparent(true)라, 이 페이지가 실제로 그리는
 * 만큼만(둥근 입력 카드 하나) 데스크톱 위에 보인다 — 그래서 몸통 배경을 전부
 * 투명으로 두는 게 핵심이다.
 *
 * 입력을 분석하는 로직은 새로 만들지 않는다. 일정 추가 팝업의 "퀵 입력"과
 * 완전히 같은 lib/quickParse.ts를 그대로 쓴다 — 두 군데서 다르게 동작하면
 * "아까는 됐는데 여기선 안 된다"는 혼란만 남는다.
 */
type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (!internals) return Promise.reject(new Error("Tauri 환경이 아닙니다"));
  return internals.invoke(cmd, args) as Promise<T>;
}

export default function QuickAddPage() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 이 창은 숨겼다 보여줬다만 하지 새로 열리는 게 아니라서(JS 상태가 살아있다),
  // 단축키로 다시 뜰 때마다 지난번 입력이 남아 있으면 안 된다. 네이티브 창이
  // OS 포커스를 되찾는 순간 브라우저 focus 이벤트가 뜨는 걸 신호로 삼는다.
  useEffect(() => {
    function reset() {
      setText("");
      setError(null);
      inputRef.current?.focus();
    }
    reset();
    window.addEventListener("focus", reset);
    return () => window.removeEventListener("focus", reset);
  }, []);

  function close() {
    invokeTauri("hide_quick_add").catch(() => {
      // 무시 — 어차피 창이 포커스를 잃으면 알아서도 닫힌다
    });
  }

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const parsed = parseQuickInput(trimmed, today());
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: parsed.title,
          date: parsed.date,
          endDate: null,
          startTime: parsed.time,
          endTime: null,
          memo: "",
          color: null,
          repeat: null,
          isLeave: false,
          leaveTypeId: null,
          leaveDays: null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "저장하지 못했습니다.");
        return;
      }
      // 메인 창은 별도 웹뷰라 이 저장을 모른다 — 새로고침까지 시켜야 달력에 보인다
      invokeTauri("refresh_main_and_hide_quick_add").catch(() => close());
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // 엔터를 누르기 전에 무엇이 만들어질지 미리 보여준다 — 알프레드의 부제(subtitle)와
  // 같은 역할이다. 파싱은 정규식뿐이라 입력마다 다시 돌려도 비용이 없다.
  const preview = text.trim() ? parseQuickInput(text.trim(), today()) : null;

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      style={{ background: "transparent" }}
      className="flex h-screen items-center justify-center p-3"
    >
      <style>{`html, body { background: transparent !important; }`}</style>
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 한글 입력 중 마지막 글자가 아직 조합(composition) 중일 때 오는 Enter는
            // "지금 저장해라"가 아니라 IME가 그 글자를 확정하려고 보내는 것이다.
            // 이걸 구분 안 하면 "회의"를 다 쳤다고 생각하고 Enter를 눌러도, 실제
            // text state에는 마지막 글자가 아직 안 들어가 있어 제목이 잘리거나
            // (trim 후 비어 있으면) 아예 아무 반응이 없는 것처럼 보인다.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          disabled={saving}
          placeholder="일정을 말하듯 적어보세요 — 내일 오후 3시 팀 회의"
          className="w-full bg-transparent px-5 py-4 text-lg text-foreground outline-none placeholder:text-muted"
        />
        {(preview || error) && (
          <div className="border-t border-border px-5 py-2 text-xs">
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : (
              preview && (
                <span className="text-muted">
                  <span className="text-accent">{formatShortKo(preview.date)}</span>
                  {preview.time && <span className="text-accent"> {preview.time}</span>} ·{" "}
                  {preview.title}
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
