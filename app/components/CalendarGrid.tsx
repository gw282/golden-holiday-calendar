import Link from "next/link";
import type { CalendarDay, CalendarMonth } from "@/lib/calendar";
import type { Event } from "@/lib/events";
import { isoWeekNumber, type DateStr, type WeekStart } from "@/lib/date";
import { colorFg, colorHex } from "@/lib/eventColors";
import DayCellInteractive from "./DayCellInteractive";
import EventPreviewChip from "./EventPreviewChip";

/** 0=일 … 6=토 요일 이름. 헤더는 이 인덱스로 색을 정하지, 화면 위치로 정하지 않는다 —
    주 시작 요일이 바뀌어도 "일요일은 빨강" 규칙 자체는 그대로여야 하기 때문이다 */
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 헤더에 보여줄 요일 순서(0=일…6=토 인덱스 배열).
 * 월요일 시작이 기본인 이유: 주말이 오른쪽 끝에 붙어 연휴가 한눈에 이어져 보인다.
 * 일요일 시작으로 바꾸면 그 대신 익숙한 배치가 되지만, 토요일과 다음 주 일요일이
 * 줄 경계에서 갈라진다 — 사용자가 고른 트레이드오프라 그대로 따른다.
 */
function weekdayOrder(weekStart: WeekStart): number[] {
  return weekStart === "sun" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
}

/** 띠 한 줄의 높이(px). 칸 아래에 이만큼씩 자리를 비워 둔다 */
const BAND_HEIGHT = 18;

/** 왼쪽 주차 배지 폭. 헤더 줄의 빈 스페이서도 이 폭에 맞춘다 */
const WEEK_NUM_WIDTH = "1.75rem";

type Range = { start: DateStr; end: DateStr };

/** 한 주 안에서 띠가 차지하는 칸 범위와 층 */
type Band = { event: Event; from: number; length: number; lane: number; continues: boolean };

/**
 * 서버 컴포넌트 — 월/주 레이아웃과 띠(band) 계산은 여기서 그대로 한다.
 * 셀 자체는 더블클릭 메모 때문에 얇은 클라이언트 리프(`DayCellInteractive`)로
 * 감싸져 있지만, 그 내용물(공휴일명·일정 미리보기)은 여전히 이 파일이 계산해
 * children으로 넘긴다 — 다시 계산하지 않는다.
 *
 * 여러 날에 걸친 일정은 칸마다 같은 제목을 반복하지 않고 **가로 띠**로 그린다.
 * 그래서 42칸을 한 번에 깔지 않고 **주 단위로** 렌더링한다. 주마다 relative 컨테이너를
 * 두고 퍼센트 위치로 띠를 얹으면 자바스크립트 없이 열에 정확히 맞출 수 있다.
 */
export default function CalendarGrid({
  month,
  selected,
  hrefFor,
  weekStart = "mon",
  highlightRange,
  highlightKey = "",
}: {
  month: CalendarMonth;
  selected: DateStr;
  hrefFor: (date: DateStr) => string;
  /** month.weeks가 이미 이 기준으로 짜여 있다 — 헤더 요일 순서를 맞추는 데만 쓴다 */
  weekStart?: WeekStart;
  /** 추천에서 넘어온 연휴 구간 — 그 날들이 잠깐 깜빡인다 */
  highlightRange?: Range | null;
  /** 이 값이 바뀌면 셀을 새로 마운트해 애니메이션을 다시 태운다 */
  highlightKey?: string;
}) {
  const weekBands = month.weeks.map((week) => layoutBands(week, month.spanning));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex border-b border-border">
        <div
          aria-hidden
          style={{ width: WEEK_NUM_WIDTH }}
          className="week-num shrink-0 border-r border-border"
        />
        <div className="grid flex-1 grid-cols-7">
          {weekdayOrder(weekStart).map((wd) => (
            <div
              key={wd}
              className={`py-2 text-center text-xs font-medium ${
                wd === 0 ? "text-holiday" : wd === 6 ? "text-saturday" : "text-muted"
              }`}
            >
              {WEEKDAY_KO[wd]}
            </div>
          ))}
        </div>
      </div>

      {month.weeks.map((week, weekIndex) => {
        const bands = weekBands[weekIndex];
        const lanes = bands.length === 0 ? 0 : Math.max(...bands.map((b) => b.lane)) + 1;
        const isLastWeek = weekIndex === month.weeks.length - 1;

        return (
          <div key={week[0].date} className="flex">
            {/* ISO 주차. 그 주의 월요일(week[0])이 속한 주차를 그대로 쓴다 */}
            <div
              aria-hidden
              style={{ width: WEEK_NUM_WIDTH }}
              className={`week-num flex shrink-0 items-start justify-center border-r border-border pt-1.5 font-mono text-[10px] text-muted ${
                isLastWeek ? "" : "border-b"
              }`}
            >
              {isoWeekNumber(week[0].date)}
            </div>

            <div className="relative flex-1">
              <div className="grid grid-cols-7">
                {week.map((day) => (
                  <Cell
                    key={`${day.date}:${highlightKey}`}
                    day={day}
                    selected={day.date === selected}
                    flash={inRange(day.date, highlightRange)}
                    reservedPx={lanes * BAND_HEIGHT}
                    bottomBorder={!isLastWeek}
                    href={hrefFor(day.date)}
                  />
                ))}
              </div>

              {bands.map((band) => (
                // 래퍼는 클릭을 통과시킨다. 띠가 아래 날짜 칸의 절반가량을 덮고 있어서
                // 그대로 두면 빈 자리를 눌러도 일정 시작일로 튄다.
                <div
                  key={band.event.id}
                  className="pointer-events-none absolute px-1"
                  style={{
                    left: `${(band.from / 7) * 100}%`,
                    width: `${(band.length / 7) * 100}%`,
                    bottom: `${band.lane * BAND_HEIGHT + 2}px`,
                  }}
                >
                  <Link
                    href={hrefFor(band.event.date)}
                    scroll={false}
                    className={`pointer-events-auto block truncate rounded px-1.5 py-0.5 text-[10px] leading-tight ${
                      band.event.done
                        ? "bg-border text-muted line-through"
                        : "hover:brightness-110"
                    }`}
                    style={
                      band.event.done
                        ? undefined
                        : {
                            backgroundColor: colorHex(band.event.color),
                            color: colorFg(band.event.color),
                          }
                    }
                  >
                    {band.event.title}
                    {band.continues && " ›"}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function inRange(date: DateStr, range: Range | null | undefined): boolean {
  return !!range && date >= range.start && date <= range.end;
}

/**
 * 한 주에 걸치는 일정들을 칸 범위로 자르고, 겹치지 않게 층을 배정한다.
 * 시작이 빠른 것 → 긴 것 순으로 훑으며 비어 있는 첫 층에 넣는 단순 그리디다.
 */
function layoutBands(week: CalendarDay[], spanning: Event[]): Band[] {
  const weekStart = week[0].date;
  const weekEnd = week[week.length - 1].date;

  const inWeek = spanning
    .filter((e) => e.date <= weekEnd && e.endDate >= weekStart)
    .sort((a, b) =>
      a.date === b.date ? (a.endDate < b.endDate ? 1 : -1) : a.date < b.date ? -1 : 1,
    );

  /** lane별로 지금까지 채워진 마지막 칸 번호 */
  const laneEnd: number[] = [];
  const bands: Band[] = [];

  for (const event of inWeek) {
    const from = Math.max(
      0,
      week.findIndex((d) => d.date >= event.date),
    );
    let to = week.length - 1;
    while (to > from && week[to].date > event.endDate) to--;

    let lane = laneEnd.findIndex((end) => end < from);
    if (lane === -1) lane = laneEnd.length;
    laneEnd[lane] = to;

    bands.push({
      event,
      from,
      length: to - from + 1,
      lane,
      continues: event.endDate > weekEnd,
    });
  }

  return bands;
}

function Cell({
  day,
  selected,
  flash,
  reservedPx,
  bottomBorder,
  href,
}: {
  day: CalendarDay;
  selected: boolean;
  flash: boolean;
  /** 아래쪽에 띠가 놓일 만큼 비워 둘 높이 */
  reservedPx: number;
  bottomBorder: boolean;
  href: string;
}) {
  const rest = day.holiday !== null || day.weekday === 0 || day.weekday === 6;
  // 숫자 색은 **왜** 쉬는지를 말한다 — 일요일·공휴일은 빨강, 토요일은 파랑.
  // 배경은 **쉬는지 아닌지**만 말한다. 두 정보를 색 하나에 겹쳐 싣지 않는다.
  const numberColor =
    day.holiday !== null || day.weekday === 0
      ? "text-holiday"
      : day.weekday === 6
        ? "text-saturday"
        : "";

  /**
   * 배경은 셋 중 **하나만** 칠한다. 클래스를 나란히 쓰면 특정도가 같아 CSS 원본 순서가
   * 이기는데, 그러면 고른 날이 주말일 때 어느 쪽이 나올지 Tailwind 출력 순서에 달린다.
   *
   * 주말 열만 칠하지 않고 **공휴일까지 같이** 칠하는 이유: 이 앱에서 뜻이 있는 구분은
   * 토·일이 아니라 '쉬는 날 / 일하는 날'이다. 목요일 개천절이 하얗게 남으면
   * 징검다리를 눈으로 찾는 일 자체가 안 된다.
   */
  const background = selected ? "bg-accent-soft" : rest ? "bg-rest" : "";

  const shown = day.events.slice(0, 2);
  const hidden = day.events.length - shown.length;

  return (
    <DayCellInteractive
      date={day.date}
      href={href}
      selected={selected}
      dayOfMonth={day.dayOfMonth}
      isToday={day.isToday}
      numberColorClass={numberColor}
      style={{ paddingBottom: `${reservedPx + 6}px` }}
      className={`flex min-h-[84px] flex-col gap-0.5 border-r border-border p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0 hover:bg-accent-soft/60 ${
        bottomBorder ? "border-b" : ""
      } ${background} ${day.inMonth ? "" : "opacity-40"} ${
        flash ? "flash-day" : ""
      }`}
    >
      {day.holiday && (
        <span className="truncate text-[10px] leading-tight text-holiday">{day.holiday.name}</span>
      )}

      {/* 기본은 꺼짐 — globals.css가 data-solar-term="on"일 때만 보이게 한다.
          항상 그려 두는 이유는 weekNum과 같다: 서버는 계산만 하고, 보이기/숨기기는
          CSS 하나로 끝내 서버 재요청 없이 즉시 토글되게 하려는 것이다. */}
      {day.solarTerm && (
        <span className="solar-term truncate text-[10px] leading-tight text-solar-term">
          {day.solarTerm}
        </span>
      )}

      {/* DB 이벤트가 아니라 순수 표시용이라 색은 이 자리에서만 hex로 직접 준다.
          title로 "왜 못 고치지"에 미리 답해 둔다 — 직접 등록·수정할 길이 없다 */}
      {day.milestone && (
        <span
          className="truncate text-[10px] leading-tight"
          style={{ color: day.milestone.color }}
          title={`${day.milestone.title} — 회사 고정 일정이라 직접 등록·수정할 수 없습니다`}
        >
          {day.milestone.title}
        </span>
      )}

      {shown.map((e) => (
        <EventPreviewChip key={e.id} title={e.title} done={e.done} colorHex={colorHex(e.color)} />
      ))}

      {hidden > 0 && <span className="text-[10px] text-muted">+{hidden}건</span>}
    </DayCellInteractive>
  );
}
