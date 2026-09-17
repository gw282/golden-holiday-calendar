"use client";

import { useEffect, useRef, useState } from "react";

const PANEL_OPEN_EVENT = "mg-panel-open";

export default function FeatureGuideButton({ desktop = false }: { desktop?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!dialog.current) return;
    if (open) dialog.current.showModal();
    else dialog.current.close();
  }, [open]);

  useEffect(() => {
    function closeWhenAnotherPanelOpens(event: Event) {
      if ((event as CustomEvent<string>).detail !== "features") setOpen(false);
    }
    window.addEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeWhenAnotherPanelOpens);
  }, []);

  function toggleFeatures() {
    const next = !open;
    if (next) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: "features" }));
    setOpen(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleFeatures}
        title="기능 안내"
        className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        ✨ 기능 안내
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto hidden max-h-[calc(85vh/var(--app-zoom,1))] w-[min(34rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-surface p-0 text-left text-foreground shadow-lg open:flex backdrop:bg-black/40"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">기능 안내</h2>
            <p className="mt-0.5 text-[11px] text-muted">필요한 기능을 골라서 확인하세요.</p>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            <FeatureCard icon="📅" title="올인원 달력" detail="날짜를 누르면 오른쪽에서 해당 날짜의 일정을 바로 확인하고 관리할 수 있습니다. 기간 일정은 달력에 띠로 표시되며, 공휴일과 함께 볼 수 있습니다.">
              공휴일, 개인 일정, 기간 일정을 한 화면에서 확인하고 관리합니다.
            </FeatureCard>
            <FeatureCard icon="🌟" title="황금 연휴" detail="휴가 설정과 등록된 일정을 고려해 공휴일·주말과 이어 쉴 수 있는 조합을 추천합니다. 헤더의 황금 연휴에서 추천 기능을 켜고 끌 수 있으며, 추천한 날짜는 바로 일정으로 등록할 수 있습니다.">
              휴가 설정을 기준으로 공휴일과 주말을 이어 쉴 수 있는 날짜를 추천합니다.
            </FeatureCard>
            <FeatureCard icon="🔎" title="검색 & 정리" detail="일정 찾기 입력창에서 제목과 메모를 키워드로 검색하고, 초성만 입력해도 일정을 찾을 수 있습니다. 지난 미완료 일정은 따로 모아 보여 주며, 같은 날 시간이 겹치는 일정은 저장을 막지 않고 충돌만 표시합니다.">
              키워드·초성 검색, 지난 미완료 일정 확인, 시간 겹침 표시를 지원합니다.
            </FeatureCard>
            <FeatureCard icon="📋" title="백업 & 가져오기" detail="일정을 표준 .ics 파일로 내보내 다른 캘린더에 옮길 수 있습니다. .ics 파일을 미리 확인한 뒤 기존 일정과 중복되는 항목을 정리해 가져옵니다.">
              일정을 .ics 파일로 내보내거나 다른 일정 파일에서 가져옵니다.
            </FeatureCard>
            <FeatureCard icon="⏳" title="D-Day 찾기" detail="등록된 전체 일정을 오늘과 가까운 순으로 보여주고, 각 일정까지 며칠 남았는지(D-N)·지났는지(D+N)를 바로 계산해 줍니다. 별 아이콘으로 하나를 고정하면 헤더 버튼 자체가 그 일정의 D-Day로 바뀝니다.">
              아무 일정이나 골라 오늘 기준 D-Day를 확인하고, 하나를 헤더에 고정할 수 있습니다.
            </FeatureCard>
            <FeatureCard icon="✅" title="업무 보조" detail="날짜별 한 줄 메모와 이모지(최대 3개), 할 일을 따로 관리하고, 선택한 날짜의 일정을 업무보고용 텍스트로 복사할 수 있습니다.">
              날짜별 메모·이모지와 할 일을 관리하고 업무보고용 텍스트를 복사합니다.
            </FeatureCard>
            <FeatureCard icon="🖥️" title="화면 설정" detail="화면 배율(50~200%, Ctrl+휠로도 조정)과 라이트·다크·시스템 테마를 한 팝업에서 바꿀 수 있습니다. 윈도우 앱에서는 알림 설정에서 일정 알림 시점과 1시간 간격 휴식 알림도 따로 조정할 수 있습니다.">
              화면 배율·테마를 조정하고, 윈도우 앱에서는 알림도 따로 설정합니다.
            </FeatureCard>
            {desktop && (
              <>
                <FeatureCard icon="✅" title="바탕화면 할 일" detail="오늘 할 일 목록의 바탕화면에 띄우기를 누르면 다른 앱 위에 반투명 위젯이 표시됩니다. 위젯에서 완료 표시를 바꾸면 메인 앱과 바로 동기화됩니다.">
                  오늘 할 일을 바탕화면 위젯으로 띄우고 완료 상태를 함께 관리합니다.
                </FeatureCard>
                <FeatureCard icon="🔔" title="윈도우 알림" detail="시작 시 알림, 15분 전·30분 전·1시간 전·2시간 전 알림을 필요한 것만 선택할 수 있습니다. 1시간 간격 휴식 알림도 제공하며, 알림 테스트를 누르면 일정 또는 휴식 알림 문구가 바로 표시됩니다.">
                  일정 알림과 휴식 알림을 설정하고 실제 알림을 테스트합니다.
                </FeatureCard>
                <FeatureCard icon="🗂️" title="트레이 실행" detail="창의 닫기 버튼을 눌러도 앱은 트레이에 남아 알림을 계속 보냅니다. 완전히 종료하려면 트레이 아이콘 메뉴에서 종료를 선택하면 됩니다. 설치 완료 화면에서는 윈도우 시작 시 자동 실행도 선택할 수 있습니다.">
                  창을 닫아도 트레이에서 실행되며, 설치할 때 윈도우 시작 시 자동 실행을 선택할 수 있습니다.
                </FeatureCard>
              </>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            {desktop
              ? "윈도우 앱은 인터넷 없이 일정과 설정을 내 PC에 저장합니다."
              : "자세한 사용 규칙과 단축키는 ? 도움말에서 확인할 수 있습니다."}
          </p>
        </div>
      </dialog>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  detail,
  children,
}: {
  icon: string;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <details name="feature-guide" className="group rounded-lg border border-border bg-background/40">
      <summary className="cursor-pointer list-none px-3 py-3 marker:hidden">
        <span className="text-xs font-semibold text-foreground">
          {icon} {title}
        </span>
        <span className="float-right text-muted transition-transform group-open:rotate-180">⌄</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-muted">{children}</span>
      </summary>
      <p className="border-t border-border px-3 pb-3 pt-2 text-[11px] leading-relaxed text-muted">
        {detail}
      </p>
    </details>
  );
}
