"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 화면 전체 도움말.
 *
 * 안내 문장을 화면 곳곳에 흘려 두면 평소엔 눈에만 걸리고 정작 필요할 때는 못 찾는다.
 * 달력 아래에 접어 두기도 했었지만, 내용이 달력·목록·단축키를 다 다루는 전체 도움말이라
 * 범위와 위치가 어긋났다. 그래서 헤더로 올렸다.
 */
export default function HelpButton({ desktop = false }: { desktop?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!dialog.current) return;
    if (open) dialog.current.showModal();
    else dialog.current.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="도움말"
        title="도움말"
        // 제목 옆에 붙어서 글자 크기에 따라 찌그러지지 않도록 정원(h=w)으로 고정한다
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] leading-none text-muted hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        ?
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        // 세로로도 vw/vh 기준 상한을 둔다 — 화면 확대(zoom)는 창 크기(vh)를 줄이지
        // 않아서, 내용이 창보다 커지면 아래쪽이 창 밖으로 밀려날 수 있다. 헤더는
        // 고정하고 본문만 스크롤되게 나눠서 어떤 배율에서도 끝까지 읽을 수 있게 한다.
        className="m-auto hidden max-h-[85vh] w-[min(30rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-surface p-0 text-left text-foreground shadow-lg open:flex backdrop:bg-black/40"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">도움말</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {/* **화면을 보면 아는 것은 적지 않는다.** 달력을 누르면 그 날이 열린다거나,
              테마 단추가 테마를 바꾼다거나 하는 설명은 자리만 먹고 정작 필요한 줄을 가린다.
              여기 남는 것은 **화면에 드러나지 않는 규칙**뿐이다. */}
          <div className="border-b border-border bg-accent-soft/40 px-4 py-3 text-xs">
            <p className="font-semibold text-foreground">처음 시작하는 순서</p>
            <p className="mt-1 leading-relaxed text-muted">
              ① 달력에서 날짜 선택 → ② 오른쪽의{" "}
              <span className="font-medium text-foreground">+ 추가</span> → ③ 제목과 날짜 입력 →
              ④ 저장. 등록한 일정은 선택한 날짜 오른쪽 목록에서 바로 관리합니다.
            </p>
          </div>
          <dl className="flex flex-col gap-3 p-4 text-xs">
          {/* 화면 곳곳의 단추·아이콘에 이미 붙어 있는 것(더블클릭 메모, 화면 확대,
              주차 표시, 색 배지 등)은 여기 또 안 적는다 — 커서를 2초 올려 두면
              그 자리에서 바로 뜬다. 여기 남는 것은 **어느 한 단추에도 안 걸리는
              전체 규칙**뿐이다. */}
          <Row term="일정 등록">
            제목과 시작일은 필수입니다. 반복 일정은{" "}
            <span className="text-foreground">횟수</span> 또는{" "}
            <span className="text-foreground">종료일까지</span> 중 골라 저장하세요.
          </Row>
          <Row term="휴가 잔고">
            <span className="text-foreground">연차는 입사일</span>부터 1년,{" "}
            <span className="text-foreground">특별휴가는 연말</span>에 사라집니다. 쓴 일수는 주말·공휴일을
            빼고 자동으로 셉니다.
          </Row>
          <Row term="연휴 추천">
            공휴일이 없는 주에도 아무 날이나 눌러 보세요. 이미 하루 종일 일정이 있는 날은 빠집니다.
          </Row>
          <Row term="검색">
            <span className="text-foreground">초성만 쳐도</span>{" "}
            (예: <span className="font-mono">ㅈㄱㅎㅇ</span> → 주간회의) 찾아집니다.
          </Row>
          {desktop && (
            <Row term="닫기 버튼">
              ✕를 눌러도 <span className="text-foreground">종료되지 않고 트레이로 숨습니다.</span>{" "}
              완전히 끄려면 트레이 아이콘을 눌러 종료를 고르세요.
            </Row>
          )}
          {desktop && (
            <Row term="퀵 입력창">
              어디서든 <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Space</Kbd> — 화면 가운데 작은
              입력창이 뜹니다. 문장을 치고 Enter로 바로 일정이 만들어집니다.
            </Row>
          )}
          <Row term="설정">
            황금연휴 추천 · 주차 표시{desktop && " · 알림 시점"}은 헤더의{" "}
            <span className="text-foreground">설정</span>에서 켜고 끕니다.
          </Row>
          <Row term="단축키">
            <Kbd>←</Kbd> <Kbd>→</Kbd> 월 이동 · <Kbd>T</Kbd> 오늘 · <Kbd>N</Kbd> 새 일정 ·{" "}
            <Kbd>Esc</Kbd> 닫기
            <br />
            나머지는 글자에 커서를 <span className="text-foreground">2초</span> 올려 두면 뜹니다.
          </Row>
          </dl>
        </div>
      </dialog>
    </>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-3">
      <dt className="font-semibold">{term}</dt>
      <dd className="leading-relaxed text-muted">{children}</dd>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border px-1 font-sans">{children}</kbd>;
}
