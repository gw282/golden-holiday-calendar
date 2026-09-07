"use client";

import { useRef } from "react";

/**
 * 화면 전체 도움말.
 *
 * 안내 문장을 화면 곳곳에 흘려 두면 평소엔 눈에만 걸리고 정작 필요할 때는 못 찾는다.
 * 달력 아래에 접어 두기도 했었지만, 내용이 달력·목록·단축키를 다 다루는 전체 도움말이라
 * 범위와 위치가 어긋났다. 그래서 헤더로 올렸다.
 */
export default function HelpButton() {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label="도움말"
        title="도움말"
        // 제목 옆에 붙어서 글자 크기에 따라 찌그러지지 않도록 정원(h=w)으로 고정한다
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] leading-none text-muted hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        ?
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-left text-foreground shadow-lg backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
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

        {/* **화면을 보면 아는 것은 적지 않는다.** 달력을 누르면 그 날이 열린다거나,
            테마 단추가 테마를 바꾼다거나 하는 설명은 자리만 먹고 정작 필요한 줄을 가린다.
            여기 남는 것은 **화면에 드러나지 않는 규칙**뿐이다. */}
        <div className="border-b border-border bg-accent-soft/40 px-4 py-3 text-xs">
          <p className="font-semibold text-foreground">처음 시작하는 순서</p>
          <p className="mt-1 leading-relaxed text-muted">
            ① 달력에서 날짜 선택 → ② 오른쪽의 <span className="font-medium text-foreground">+ 추가</span> → ③ 제목과 날짜 입력 → ④ 저장.
            등록한 일정은 선택한 날짜 오른쪽 목록에서 바로 관리합니다.
          </p>
        </div>
        <dl className="flex flex-col gap-3 p-4 text-xs">
          <Row term="일정 등록">
            제목과 시작일은 필수입니다. 종료일을 넣으면 기간 일정이 되고, 시간·메모·색은 필요할 때만 입력합니다.
            반복 일정은 반복 횟수까지 정해 저장하세요.
          </Row>
          <Row term="완료·수정">
            목록의 체크 표시로 완료를 바꾸고, 일정 항목의 수정 버튼에서 내용을 고칩니다. 삭제한 일정은 복구할 수 없습니다.
          </Row>
          <Row term="휴가 잔고">
            <span className="text-foreground">연차는 입사일</span>부터 1년,{" "}
            <span className="text-foreground">특별휴가는 연말</span>에 사라집니다. 쓴 일수는 주말·공휴일을
            빼고 자동으로 셉니다.
          </Row>
          <Row term="연휴 추천">
            공휴일이 없는 주에도 아무 날이나 눌러 보세요. 이미 하루 종일 일정이 있는 날은 빠집니다.
          </Row>
          <Row term="항공·숙소">
            추천이 여러 줄이면 <span className="text-accent">파랗게 표시된 줄</span> 기준입니다.
            가격은 가져오지 않습니다.
          </Row>
          {/* 이 스위치가 무엇을 끄는지는 **화면을 봐도 알 수 없다.** 끄고 나서야
              항공권 줄이 사라진 것을 눈치채는데, 그때는 왜 사라졌는지 모른다.
              무엇이 사라지는지보다 **무엇이 그대로인지**를 먼저 적는다 — 오프라인으로
              바꾸는 순간 앱이 반쪽이 되는 게 아닌지가 실제로 궁금한 것이기 때문이다. */}
          <Row term="오프라인">
            달력 · 일정 · 연차 · 연휴 추천은 <span className="text-foreground">그대로 됩니다</span>{" "}
            (전부 이 PC에서 계산합니다).
            <br />
            <span className="text-holiday">사라지는 것</span>은 밖에 닿아야 하는 넷입니다 —
            항공권·숙소 검색, 환율, 구글 캘린더, 챗봇.
          </Row>
          <Row term="회사 내부망">
            설치한 PC에서 프로그램을 실행하면 그 PC의 일정 DB를 사용합니다. 다른 사내 PC에서 함께 보려면 설치한 PC의 사내 IP 주소로 접속해야 합니다.
          </Row>
          <Row term="단축키">
            <Kbd>←</Kbd> <Kbd>→</Kbd> 월 이동 · <Kbd>T</Kbd> 오늘 · <Kbd>N</Kbd> 새 일정 ·{" "}
            <Kbd>Esc</Kbd> 닫기
            <br />
            나머지는 글자에 커서를 <span className="text-foreground">2초</span> 올려 두면 뜹니다.
          </Row>
        </dl>
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
