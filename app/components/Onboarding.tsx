"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "mg-manage-onboarding-seen";

export default function Onboarding() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) dialog.current?.showModal();
  }, []);

  function close() {
    localStorage.setItem(STORAGE_KEY, "1");
    dialog.current?.close();
  }

  return (
    <dialog
      ref={dialog}
      onCancel={close}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">처음 시작</p>
        <h2 className="mt-1 text-lg font-bold">이번 달 일정을 한 번 채워 볼까요?</h2>
        <p className="mt-1 text-xs text-muted">MG 매니지는 날짜를 고르고, 일정과 연차를 쌓아 가는 화면입니다.</p>
      </div>
      <ol className="flex flex-col gap-4 px-5 py-5 text-sm">
        <Step number="1" title="날짜를 고릅니다">달력에서 일정을 등록할 날을 클릭하세요.</Step>
        <Step number="2" title="+ 일정 추가를 누릅니다">제목, 날짜, 시간과 메모를 입력하고 저장하세요. 여러 날 일정도 가능합니다.</Step>
        <Step number="3" title="🌟 황금 연휴를 확인합니다">날짜를 고르면 오른쪽에 그 날이 낀 연휴 조합이 뜹니다. 마음에 들면 그 자리에서 바로 연차로 등록하세요.</Step>
      </ol>
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-[11px] text-muted">이 안내는 처음 한 번만 뜹니다. 궁금한 점은 ? 도움말에서.</span>
        <button type="button" onClick={close} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
          일정 등록 시작
        </button>
      </div>
    </dialog>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{number}</span>
      <span><strong className="font-semibold">{title}</strong><span className="mt-0.5 block text-xs leading-relaxed text-muted">{children}</span></span>
    </li>
  );
}