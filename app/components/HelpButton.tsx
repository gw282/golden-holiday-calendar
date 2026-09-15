"use client";

import { useEffect, useRef, useState } from "react";

const PANEL_OPEN_EVENT = "mg-panel-open";

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

  useEffect(() => {
    function closeWhenAnotherPanelOpens(event: Event) {
      if ((event as CustomEvent<string>).detail !== "help") setOpen(false);
    }
    window.addEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
  }, []);

  function toggleHelp() {
    const next = !open;
    if (next) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: "help" }));
    setOpen(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleHelp}
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
              ① 달력에서 날짜 고르기 → ② 오른쪽의{" "}
              <span className="font-medium text-foreground">+ 일정 추가</span> → ③ 일정 정보 입력 →
              ④ 저장.
              <br />
              저장한 일정은 선택한 날짜의 오른쪽 목록에서 바로 확인하고 관리할 수 있습니다.
            </p>
          </div>
          <dl className="flex flex-col gap-3 p-4 text-xs">
            <Row term="일정 등록">
              제목과 날짜만으로 등록할 수 있습니다. 여러 날에 걸친 기간이나 특정 시각·시간
              범위도 설정할 수 있고, 반복 일정은{" "}
              <span className="text-foreground">횟수</span> 또는{" "}
              <span className="text-foreground">종료일까지</span> 중 골라 저장하세요.
            </Row>
            <Row term="기능 안내">
              헤더의 <span className="text-foreground">✨ 기능 안내</span>에서 주요 기능과 사용법을
              확인할 수 있습니다.
            </Row>
            <Row term="화면">
              <span className="text-foreground">비율 조정</span>으로 화면 크기를 바꾸고,{" "}
              <span className="text-foreground">다크모드·화이트모드</span>로 화면 테마를 선택할 수
              있습니다.
            </Row>
            {desktop && (
              <Row term="알림 설정">
                시작 시 알림, 일정 전 알림과 휴식 알림을 조정할 수 있습니다.
              </Row>
            )}
            <Row term="휴가 설정">
              <span className="text-foreground">연차는 입사일 기준으로 1년마다</span> 갱신되고,{" "}
              <span className="text-foreground">특별휴가는 연말</span>에 사라집니다. 쓴 일수는 주말·공휴일을
              빼고 자동으로 계산됩니다.
            </Row>
            <Row term="황금연휴">
              공휴일과 주말 사이에 휴가를 붙여 길게 쉴 수 있는 날짜를 추천합니다.{" "}
              <span className="text-foreground">황금 연휴</span>에서 추천 기능을 켜거나 끌 수 있고,
              마음에 드는 조합은 바로 일정으로 등록할 수 있습니다.
            </Row>
            <Row term="검색">
              <span className="text-foreground">초성이나 키워드</span>로 일정을 검색할 수 있습니다.
              <br />
              (예: <span className="font-mono">ㅈㄱㅎㅇ</span> → 주간회의)
            </Row>
            <Row term="단축키">
              <Kbd>←</Kbd> <Kbd>→</Kbd> 월 이동 · <Kbd>T</Kbd> 오늘 · <Kbd>N</Kbd> 새 일정 ·{" "}
              <Kbd>Ctrl</Kbd>+<Kbd>F</Kbd> 검색 · <Kbd>Esc</Kbd> 닫기
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
