"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PreviewItem, PreviewResult } from "@/lib/importIcs";
import type { RepeatFreq } from "@/lib/events";
import DatePicker from "./DatePicker";

/**
 * `.ics` 백업 — 내보내기 / 가져오기.
 *
 * 가져오기는 **미리보기를 거친다.** 예전에는 파일을 고르는 순간 최대 500건이 그대로
 * 들어갔는데, 무엇이 들어올지 볼 수도 되돌릴 수도 없었다. 실제로 구글 캘린더를 넣어 보니
 * 공휴일이 두 벌 찍히고, 하루 종일 일정이 연차 추천을 조용히 막았다.
 *
 * 내보내기는 `<a download>`로 끝난다 — fetch로 받아 Blob을 만들 이유가 없다.
 */

type Choice = { skip: boolean; freq: RepeatFreq | ""; count: string };

export default function BackupButton() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 미리보기 중인 파일 원문. 확정할 때 그대로 다시 보낸다 */
  const [ics, setIcs] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [done, setDone] = useState<{ batchId: number | null; added: number } | null>(null);
  // 가져올 기간. 비우면 전체 기간. 파일 하나에 몇 년 치가 섞여 있을 때
  // (구글 캘린더 내보내기가 특히 그렇다) 필요한 구간만 골라 보게 한다.
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  async function openPreview(file: File) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setDone(null);
    setRangeFrom("");
    setRangeTo("");
    try {
      const text = await file.text();
      const res = await fetch("/api/ics/preview", {
        method: "POST",
        headers: { "Content-Type": "text/calendar" },
        body: text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "파일을 읽지 못했습니다.");
        dialog.current?.showModal();
        return;
      }
      setIcs(text);
      setPreview(data as PreviewResult);
      setChoices(defaultChoices((data as PreviewResult).items));
      dialog.current?.showModal();
    } catch {
      setError("파일을 읽지 못했습니다.");
      dialog.current?.showModal();
    } finally {
      setBusy(false);
      // 같은 파일을 다시 고를 수 있게 비운다 (값이 같으면 change가 안 뜬다)
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const itemByIndex = new Map((preview?.items ?? []).map((i) => [i.index, i]));
      const overrides: Record<number, { skip?: boolean; repeat?: unknown }> = {};
      for (const [k, c] of Object.entries(choices)) {
        const index = Number(k);
        const count = Number(c.count);
        const item = itemByIndex.get(index);
        // 기간 필터 밖으로 밀려난 항목은 화면에서 체크를 바꿀 수 없었으므로
        // choices에 남아 있는 값과 무관하게 항상 뺀다.
        const skip = c.skip || (item !== undefined && !inRange(item));
        overrides[index] = {
          skip,
          repeat: c.freq && count >= 2 ? { freq: c.freq, count } : null,
        };
      }
      const res = await fetch("/api/ics/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ics, overrides }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "가져오지 못했습니다.");
        return;
      }
      setDone({ batchId: data.batchId, added: data.added });
      setPreview(null);
      startTransition(() => router.refresh());
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!done?.batchId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ics/apply?batch=${done.batchId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(null);
        setError(null);
        dialog.current?.close();
        startTransition(() => router.refresh());
      } else {
        setError(data.error ?? "되돌리지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  /** 고른 기간에 걸치는가. 하나라도 비어 있으면 그쪽은 안 가린다 */
  function inRange(item: PreviewItem): boolean {
    if (rangeFrom && item.endDate < rangeFrom) return false;
    if (rangeTo && item.date > rangeTo) return false;
    return true;
  }

  const visibleItems = preview ? preview.items.filter(inRange) : [];
  const hiddenByRange = preview ? preview.items.length - visibleItems.length : 0;
  const counts = preview ? tally(visibleItems) : null;
  const willAdd = visibleItems.filter((i) => !choices[i.index]?.skip).length;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[11px] text-muted">데이터</span>

      <a
        href="/api/ics"
        download
        className="text-[11px] text-muted underline decoration-dotted hover:text-accent"
      >
        내보내기 (.ics)
      </a>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={busy || pending}
        className="text-[11px] text-muted underline decoration-dotted hover:text-accent disabled:opacity-50"
      >
        {busy && !preview ? "읽는 중…" : "가져오기"}
      </button>

      <input
        ref={fileInput}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) openPreview(file);
        }}
      />

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        aria-labelledby="ics-title"
        // 최소 높이를 둔다 — 기간 필터로 걸러 0건이 되면 목록이 비어 창이 확 줄어드는데,
        // 그 안의 DatePicker 팝오버(달력)는 그보다 커서 줄어든 창 아래로 잘려 보인다.
        className="m-auto min-h-[26rem] w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-left text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="ics-title" className="text-sm font-semibold">
            {done ? "가져왔습니다" : "가져오기 미리보기"}
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

        {/* 넣은 뒤 — 되돌릴 기회를 **이 자리에서** 준다. 팝업을 닫고 나면
            어디서 되돌리는지 찾을 수 없어 사실상 되돌리기가 없는 것과 같다 */}
        {done && (
          <div className="flex flex-col gap-3 px-4 py-4 text-xs">
            <p className="text-muted">
              <span className="font-semibold text-foreground">{done.added}건</span>을 넣었습니다.
              달력을 확인해 보시고, 아니다 싶으면 아래에서 통째로 되돌리세요.
            </p>
            <div className="flex items-center gap-2">
              {done.batchId !== null && (
                <button
                  type="button"
                  onClick={undo}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-red-500 hover:text-red-500 disabled:opacity-50"
                >
                  {busy ? "되돌리는 중…" : `${done.added}건 되돌리기`}
                </button>
              )}
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {preview && counts && (
          <>
            {/* 파일 하나에 몇 년 치가 섞여 있을 때(구글 캘린더 내보내기가 특히 그렇다)
                필요한 기간만 골라 보게 한다. 비우면 전체 기간 그대로다. */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[11px] text-muted">
              <span>가져올 기간</span>
              <DatePicker
                value={rangeFrom}
                onChange={setRangeFrom}
                ariaLabel="가져올 기간 시작일"
                placeholder="전체"
              />
              <span>~</span>
              <DatePicker
                value={rangeTo}
                onChange={setRangeTo}
                min={rangeFrom || undefined}
                ariaLabel="가져올 기간 종료일"
                placeholder="전체"
              />
              {(rangeFrom || rangeTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setRangeFrom("");
                    setRangeTo("");
                  }}
                  className="text-accent hover:underline"
                >
                  기간 지우기
                </button>
              )}
            </div>

            <p className="border-b border-border px-4 py-2 text-[11px] text-muted">
              {hiddenByRange > 0 ? (
                <>
                  기간 안 <span className="text-foreground">{visibleItems.length}건</span>
                  <span className="text-muted"> (기간 밖 {hiddenByRange}건 제외)</span> — 새로{" "}
                </>
              ) : (
                <>
                  모두 <span className="text-foreground">{visibleItems.length}건</span> — 새로{" "}
                </>
              )}
              <span className="text-foreground">{counts.new}건</span>
              {counts.duplicate > 0 && ` · 이미 있음 ${counts.duplicate}건`}
              {counts.holiday > 0 && ` · 공휴일 ${counts.holiday}건`}
              {preview.unreadable > 0 && ` · 날짜를 못 읽어 제외 ${preview.unreadable}건`}
              <br />
              {/* 이 앱에서만 통하는 규칙이라 화면에 적어 준다 */}
              하루 종일 일정은 그 날 <span className="text-leave">연차를 못 내는 날</span>로 잡혀
              연휴 추천에서 빠집니다.
            </p>

            <ul className="max-h-[46vh] divide-y divide-border overflow-y-auto">
              {visibleItems.map((item) => (
                <Row
                  key={item.index}
                  item={item}
                  choice={choices[item.index]}
                  onChange={(c) => setChoices((prev) => ({ ...prev, [item.index]: c }))}
                />
              ))}
            </ul>

            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              <span className="text-[11px] text-muted">{willAdd}건을 넣습니다</span>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={busy || willAdd === 0}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
              >
                {busy ? "넣는 중…" : "넣기"}
              </button>
            </div>
          </>
        )}

        {error && <p className="px-4 py-3 text-xs text-red-500">{error}</p>}
      </dialog>
    </div>
  );
}

/** 한 줄 — 넣을지 고르고, 반복이면 주기·횟수를 확정한다 */
function Row({
  item,
  choice,
  onChange,
}: {
  item: PreviewItem;
  choice: Choice | undefined;
  onChange: (c: Choice) => void;
}) {
  const c = choice ?? { skip: true, freq: "" as const, count: "1" };
  const span = item.endDate > item.date ? `${short(item.date)}~${short(item.endDate)}` : short(item.date);
  const time = item.startTime ? `${item.startTime}${item.endTime ? `~${item.endTime}` : ""}` : "하루 종일";

  return (
    <li className={`px-4 py-2 text-xs ${c.skip ? "opacity-50" : ""}`}>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={!c.skip}
          onChange={(e) => onChange({ ...c, skip: !e.target.checked })}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-foreground">{item.title}</span>
            <span className="tabular-nums text-muted">{span}</span>
            <span className="text-muted">{time}</span>
            {item.status === "duplicate" && (
              <span className="rounded bg-border px-1 py-0.5 text-[10px] text-muted">
                이미 있음
              </span>
            )}
            {item.status === "holiday" && (
              <span className="rounded bg-holiday/10 px-1 py-0.5 text-[10px] text-holiday">
                공휴일과 겹침
              </span>
            )}
          </span>
        </span>
      </label>

      {/* 반복은 **여기서 사람이 확정한다.** 파일의 규칙(RRULE)을 우리가 펼치면
          취소된 회차·옮긴 회차까지 맞춰야 해서 있지도 않은 회의가 찍힌다.
          읽은 값을 채워만 두고 최종 결정은 넘긴다 */}
      {!c.skip && (item.repeat || item.unsupportedRepeat) && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 pl-5.5 text-[11px] text-muted">
          반복
          <select
            value={c.freq}
            onChange={(e) => onChange({ ...c, freq: e.target.value as RepeatFreq | "" })}
            aria-label={`${item.title} 반복 주기`}
            className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-accent [&>option]:bg-surface"
          >
            <option value="">안 함</option>
            <option value="weekly">매주</option>
            <option value="monthly">매월</option>
            <option value="yearly">매년</option>
          </select>
          {c.freq && (
            <>
              <input
                type="number"
                min={2}
                max={60}
                value={c.count}
                onChange={(e) => onChange({ ...c, count: e.target.value })}
                aria-label={`${item.title} 반복 횟수`}
                className="w-14 rounded-md border border-border bg-transparent px-1.5 py-0.5 text-right text-[11px] tabular-nums text-foreground outline-none focus:border-accent"
              />
              회
            </>
          )}
          {item.repeat?.guessed && (
            <span className="text-holiday">파일에 횟수가 없어 어림한 값입니다</span>
          )}
          {item.unsupportedRepeat && (
            <span className="text-holiday">
              {item.unsupportedRepeat} 반복은 못 옮깁니다 — 직접 골라 주세요
            </span>
          )}
        </span>
      )}
    </li>
  );
}

/**
 * 처음 체크 상태.
 *
 * 이미 있는 것과 공휴일은 **꺼 둔다** — 넣어서 두 벌이 되는 것보다 안 넣고 나중에
 * 켜는 쪽이 되돌리기 쉽다. 반복은 파일에서 읽은 값을 그대로 채워 둔다.
 */
function defaultChoices(items: PreviewItem[]): Record<number, Choice> {
  const out: Record<number, Choice> = {};
  for (const i of items) {
    out[i.index] = {
      skip: i.status !== "new",
      freq: i.repeat?.freq ?? "",
      count: String(i.repeat?.count ?? 12),
    };
  }
  return out;
}

function tally(items: PreviewItem[]) {
  return {
    new: items.filter((i) => i.status === "new").length,
    duplicate: items.filter((i) => i.status === "duplicate").length,
    holiday: items.filter((i) => i.status === "holiday").length,
  };
}

/** `2026-10-12` → `10/12` */
function short(d: string): string {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}
