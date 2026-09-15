"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeaveSummary } from "@/lib/leave";

/**
 * 휴가 설정 — 머리말에 **잔고를 넣어 둔 휴가를 전부** 띄우고, 누르면 설정까지 보인다.
 *
 * 회사마다 주기가 다른 휴가가 여러 개 돈다. 연차는 입사일 기준으로 굴러가고 특별휴가는
 * 연말에 소멸한다. 한때 급한 것 하나만 D-를 띄웠는데, 그러면 **나머지가 있다는 사실 자체가
 * 묻혔다** — 조용히 소멸하는 쪽이 오히려 놓치기 쉽다. 그래서 종류마다 전부 D-를 붙인다.
 *
 * 지급 일수는 사람이 넣는다. 근속·회계연도·촉진제도까지 코드로 옮기면 앱의 절반이
 * 노무 로직이 되고, 그건 이 앱이 하려는 일이 아니다.
 */
export default function LeaveBudgetButton({ leaves }: { leaves: LeaveSummary[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (leaves.length === 0) return null;

  // 지급 일수를 넣어 둔 것만 머리말에 올린다. 안 넣은 휴가는 보여 줄 숫자가 없다
  const shown = leaves.filter((l) => l.remaining !== null);
  const busy = busyId !== null || pending;

  async function send(path: "PUT" | "PATCH", body: Record<string, unknown>, typeId: number) {
    setError(null);
    setBusyId(typeId);
    try {
      const res = await fetch("/api/leave", {
        method: path,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "저장하지 못했습니다.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
        title="휴가 설정 — 누르면 전부 보입니다"
        className="group flex h-9 shrink-0 items-center rounded-lg border border-border px-2.5 transition-colors hover:border-accent hover:bg-accent-soft"
      >
        {/* 잔고를 넣어 둔 휴가는 **전부** 보여 준다. 하나만 띄우면 나머지가 있다는 사실 자체가
            묻히는데, 특별휴가처럼 조용히 소멸하는 쪽이 오히려 놓치기 쉽다.

            차트가 아니라 **지표 타일**이다 — 답이 숫자 하나라서다.
            정체(어느 휴가인지)는 색이 아니라 **이름**이 지고, 숫자는 본문 잉크로 둔다.
            색은 막대 하나에만 쓴다. 둘의 막대 색이 같아도 헷갈리지 않는 이유가 그것이다. */}
        {shown.length === 0 ? (
          <span className="text-[11px] text-muted">휴가 설정</span>
        ) : (
          <span className="flex items-stretch gap-3">
            {shown.map((l, i) => (
              <span key={l.type.id} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden className="w-px self-stretch bg-border" />}
                <LeaveStat leave={l} />
              </span>
            ))}
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        aria-labelledby="leave-dialog-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-left text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="leave-dialog-title" className="text-sm font-semibold">
            휴가 설정
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

        <ul className="divide-y divide-border">
          {leaves.map((l) => (
            <LeaveRow
              key={l.type.id}
              leave={l}
              busy={busy}
              onTotal={(total) => send("PUT", { total }, l.type.id)}
              onAnchor={(anchorDate) => send("PATCH", { anchorDate }, l.type.id)}
            />
          ))}
        </ul>

        {error && <p className="px-4 py-2 text-sm text-red-500">{error}</p>}

        <p className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted">
          일정 등록할 때 <span className="text-leave">휴가 사용</span>을 켜면 그만큼 자동으로
          차감됩니다. <span className="text-foreground">주말·공휴일은 빼고</span> 세고,{" "}
          <span className="text-foreground">시작일 기준</span>으로 어느 잔고에서 뺄지 정합니다.
        </p>
      </dialog>
    </>
  );
}

/** 한 종류의 줄 — 주기·잔고·설정을 한 자리에 */
function LeaveRow({
  leave,
  busy,
  onTotal,
  onAnchor,
}: {
  leave: LeaveSummary;
  busy: boolean;
  onTotal: (total: number | null) => void;
  onAnchor: (anchorDate: string | null) => void;
}) {
  const [total, setTotal] = useState(leave.total === null ? "" : String(leave.total));
  const { type, period, used, remaining, daysLeft } = leave;

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-semibold">{type.name}</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted">
          {period.start} ~ {period.end}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          지급
          <input
            type="number"
            min={0}
            max={365}
            step={type.minUnit}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            onBlur={() => onTotal(total.trim() === "" ? null : Number(total))}
            disabled={busy}
            placeholder="예: 15"
            className="w-20 rounded-md border border-border bg-transparent px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-accent disabled:opacity-40"
          />
          일
        </label>

        <span className="text-[11px] text-muted">
          쓴 <span className="font-medium text-foreground">{fmt(used)}</span>일
        </span>

        {remaining !== null && (
          <span className="text-[11px] text-muted">
            남은{" "}
            <span className={`font-semibold ${remaining < 0 ? "text-holiday" : "text-leave"}`}>
              {fmt(remaining)}
            </span>
            일
          </span>
        )}

        <span className={`ml-auto text-[11px] ${daysLeft <= 60 ? "text-holiday" : "text-muted"}`}>
          소멸까지 {daysLeft}일
        </span>
      </div>

      {/* 입사일은 사람마다 달라 물어봐야 한다. 안 넣으면 달력해로 굴러가므로 앱이 멈추지는 않는다 */}
      {type.cycle === "anniversary" && (
        <label className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          입사일
          <input
            type="date"
            defaultValue={type.anchorDate ?? ""}
            onChange={(e) => onAnchor(e.target.value || null)}
            disabled={busy}
            className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-40"
          />
          {type.anchorDate === null && (
            <span className="text-holiday">넣기 전에는 1월~12월로 셉니다</span>
          )}
        </label>
      )}
    </li>
  );
}

/** 15 -> '15', 12.5 -> '12.5', 12.25 -> '12.25' */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * 지표 타일 하나 — 이름 · 남은 일수 · 남은 비율 막대.
 *
 * 차트를 쓰지 않는 이유: 답이 **숫자 하나**라서다. 막대는 그 숫자를 설명하는 보조일 뿐이라
 * 축도 눈금도 두지 않는다.
 *
 * 정체는 이름이 지고 색은 막대 하나만 쓴다. 두 타일의 막대 색이 같아도 헷갈리지 않는
 * 이유가 그것이다 — 색으로 구분하기 시작하면 색맹인 사람에게는 구분이 사라진다.
 * D-는 종류마다 전부 붙인다 — 조용히 소멸하는 쪽이 오히려 놓치기 쉬워서, 급한 것 하나만
 * 남기면 나머지가 소멸 중이라는 사실 자체가 묻힌다.
 */
function LeaveStat({ leave }: { leave: LeaveSummary }) {
  const { type, total, remaining, daysLeft } = leave;
  const left = remaining ?? 0;
  // 다 쓰면 0, 초과하면 음수다. 막대는 0~100%로 자른다
  const pct = total && total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  const over = left < 0;

  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="flex items-baseline gap-1 leading-none">
        <span className="text-[10px] text-muted">{type.name}</span>
        <span className={`text-[9px] tabular-nums ${daysLeft <= 60 ? "text-holiday" : "text-muted"}`}>
          D-{daysLeft}
        </span>
      </span>

      <span className="flex items-baseline gap-0.5 leading-none">
        <span className={`text-[13px] font-bold tabular-nums ${over ? "text-holiday" : "text-foreground"}`}>
          {fmt(left)}
        </span>
        <span className="text-[10px] text-muted">/{fmt(total ?? 0)}일</span>
      </span>

      {/* 굵기 2px. 데이터가 아니라 맥락이라 눈에 먼저 들어오면 안 된다 */}
      <span
        aria-hidden
        className="mt-0.5 block h-[2px] w-full min-w-[52px] overflow-hidden rounded-full bg-border"
      >
        <span
          className={`block h-full rounded-full ${over ? "bg-holiday" : "bg-leave"}`}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </span>
    </span>
  );
}
