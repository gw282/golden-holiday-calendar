"use client";

import { useRef } from "react";

/**
 * 화면 전체 도움말.
 *
 * 안내 문장을 화면 곳곳에 흘려 두면 평소엔 눈에만 걸리고 정작 필요할 때는 못 찾는다.
 * 달력 아래에 접어 두기도 했었지만, 내용이 달력·목록·단축키를 다 다루는 전체 도움말이라
 * 범위와 위치가 어긋났다. 그래서 헤더로 올렸다.
 */
export default function HelpButton({ desktop = false }: { desktop?: boolean }) {
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
        // 세로로도 vw/vh 기준 상한을 둔다 — 화면 확대(zoom)는 창 크기(vh)를 줄이지
        // 않아서, 내용이 창보다 커지면 아래쪽이 창 밖으로 밀려날 수 있다. 헤더는
        // 고정하고 본문만 스크롤되게 나눠서 어떤 배율에서도 끝까지 읽을 수 있게 한다.
        className="m-auto flex max-h-[85vh] w-[min(30rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-surface p-0 text-left text-foreground shadow-lg backdrop:bg-black/40"
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
          <Row term="일정 등록">
            제목과 시작일은 필수입니다. 종료일을 넣으면 기간 일정이 되고, 시간·메모·색은 필요할 때만 입력합니다.
            반복 일정은 <span className="text-foreground">횟수</span> 또는{" "}
            <span className="text-foreground">종료일까지</span> 중 골라 저장하세요.
          </Row>
          <Row term="완료·수정·날짜 이동">
            목록의 체크 표시로 완료를 바꾸고, 수정 버튼에서 내용을 고칩니다.
            <span className="text-foreground">−1일 / +1일</span> 단추를 누르면 화면이 옮긴 날짜를
            그대로 따라갑니다. 삭제한 일정은 복구할 수 없습니다.
          </Row>
          <Row term="날짜 더블클릭 메모">
            달력의 날짜를 더블클릭하면 그 날만을 위한 짧은 메모를 남길 수 있습니다.{" "}
            <span className="text-foreground">이 PC에만 저장</span>되며(서버·다른 기기와 공유되지
            않음), 메모가 있는 날엔 모서리에 작은 점이 뜹니다.
          </Row>
          <Row term="오늘 할 일">
            달력 아래 체크리스트는 등록 절차 없이 바로 쓰는 낙서장입니다. 마찬가지로{" "}
            <span className="text-foreground">이 PC에만</span> 저장됩니다.
          </Row>
          <Row term="휴가 잔고">
            <span className="text-foreground">연차는 입사일</span>부터 1년,{" "}
            <span className="text-foreground">특별휴가는 연말</span>에 사라집니다. 쓴 일수는 주말·공휴일을
            빼고 자동으로 셉니다.
          </Row>
          <Row term="연휴 추천">
            공휴일이 없는 주에도 아무 날이나 눌러 보세요. 이미 하루 종일 일정이 있는 날은 빠집니다.
          </Row>
          <Row term="달력 왼쪽 숫자·색 배지">
            맨 왼쪽 작은 숫자는 <span className="text-foreground">그 주의 몇 번째 주</span>인지이며
            헤더의 <span className="text-foreground">주차</span> 단추로 껐다 켤 수 있습니다.
            날짜 칸의 색 배지는 급여일 같은 <span className="text-foreground">회사 고정 일정</span>이라
            직접 등록·수정할 수 없습니다.
          </Row>
          <Row term="검색">
            제목·메모로 찾거나, <span className="text-foreground">초성만 쳐도</span>{" "}
            (예: <span className="font-mono">ㅈㄱㅎㅇ</span> → 주간회의) 찾아집니다.
          </Row>
          {/* '주간 복사' 단추는 자기 tooltip이 이미 다 설명해서 여기 또 안 적는다 —
              화면을 보면 아는 것은 적지 않는다는 이 도움말의 원칙 그대로다 */}
          <Row term="화면 확대">
            헤더의 <span className="text-foreground">%</span> 단추, 또는{" "}
            <span className="text-foreground">Ctrl + 마우스 휠</span>로도 조정됩니다.
          </Row>
          <Row term="항공·숙소">
            추천이 여러 줄이면 <span className="text-accent">파랗게 표시된 줄</span> 기준입니다.
            가격은 가져오지 않습니다.
          </Row>
          {/* 이 항목이 무엇을 끄는지는 화면을 봐도 알 수 없다. 무엇이 사라지는지보다
              **무엇이 그대로인지**를 먼저 적는다 — 오프라인이 되는 순간 앱이 반쪽이 되는 게
              아닌지가 실제로 궁금한 것이기 때문이다. */}
          <Row term="오프라인">
            {desktop ? (
              <>
                이 설치본은 <span className="text-foreground">사내망 전용으로 항상 오프라인</span>{" "}
                상태입니다.
              </>
            ) : (
              "꺼져 있으면 오프라인 상태입니다."
            )}{" "}
            달력 · 일정 · 연차 · 연휴 추천은 <span className="text-foreground">그대로 됩니다</span>{" "}
            (전부 이 PC에서 계산합니다).
            <br />
            <span className="text-holiday">안 되는 것</span>은 밖에 닿아야 하는 넷입니다 —
            항공권·숙소 검색, 환율, 구글 캘린더, 챗봇.
          </Row>
          {!desktop && (
            <Row term="회사 내부망">
              설치한 PC에서 프로그램을 실행하면 그 PC의 일정 DB를 사용합니다. 다른 사내 PC에서 함께 보려면 설치한 PC의 사내 IP 주소로 접속해야 합니다.
            </Row>
          )}
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
