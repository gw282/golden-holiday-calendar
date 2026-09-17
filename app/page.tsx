import Link from "next/link";
import {
  adjacentHoliday,
  buildMonth,
  getHoliday,
  holidayCoverage,
  listHolidays,
} from "@/lib/calendar";
import type { Holiday } from "@/lib/holidays";
import { collectCandidates } from "@/lib/bridge";
import { busyDates, listEvents, listEventsByDate, timeConflictIds } from "@/lib/events";
import { leaveSummaries } from "@/lib/leave";
import { fxSnapshot } from "@/lib/fx";
import {
  getReminderThresholds,
  getWeekStart,
  isChatEnabled,
  isDesktopApp,
  isHourlyChimeEnabled,
  getHourlyChimeAnchor,
  isStartTimeReminderEnabled,
  isOffline,
  isRecommendationEnabled,
  REMINDER_THRESHOLD_OPTIONS,
} from "@/lib/settings";
import { isConfigured as googleConfigured } from "@/lib/google";
import {
  addDays,
  addMonths,
  formatKo,
  formatRangeKo,
  formatShortKo,
  isValidDateStr,
  isValidMonthStr,
  monthEnd,
  monthOf,
  monthStart,
  today,
  type DateStr,
  type MonthStr,
} from "@/lib/date";
import { colorHex } from "@/lib/eventColors";
import CalendarGrid from "./components/CalendarGrid";
import LeaveBudgetButton from "./components/LeaveBudgetButton";
import TripQuickLinks from "./components/TripQuickLinks";
import AddEventButton from "./components/AddEventButton";
import CopyDayButton from "./components/CopyDayButton";
import TodoList from "./components/TodoList";
import EventList from "./components/EventList";
import Shortcuts from "./components/Shortcuts";
import HelpButton from "./components/HelpButton";
import FeatureGuideButton from "./components/FeatureGuideButton";
import Hint from "./components/Hint";
import DisplaySettingsButton from "./components/DisplaySettingsButton";
import OmniSearch from "./components/OmniSearch";
import UpcomingMoreButton from "./components/UpcomingMoreButton";
import BackupButton from "./components/BackupButton";
import GoogleCalendarButton from "./components/GoogleCalendarButton";
import SettingsPanel from "./components/SettingsPanel";
import CalendarSettingsButton from "./components/CalendarSettingsButton";
import HolidayFinderButton from "./components/HolidayFinderButton";
import DDayButton from "./components/DDayButton";
import DetailsOutsideClose from "./components/DetailsOutsideClose";
import Onboarding from "./components/Onboarding";

// SQLite를 매 요청마다 읽는다 (정적 프리렌더 금지)
export const dynamic = "force-dynamic";

/** 공휴일 데이터가 있는 데까지만 훑는다 */
const HORIZON_DAYS = 365 * 5;
/**
 * 다가오는 일정 줄에 한 번에 보여 줄 개수.
 * **한 줄에 들어가는 만큼만.** 넘치면 줄이 두 줄이 되어 위 칸이 계속 커진다 —
 * 나머지는 '+N건' 팝업이 맡는다.
 */
const UPCOMING_LIMIT = 3;
/** 다가오는 일정에 담을 기간 — 2주. 그보다 먼 일정은 지금 당장 손댈 것이 아니다 */
const UPCOMING_DAYS = 14;
/** 고른 날이 들어가는 조합을 찾을 때 앞뒤로 볼 날수 */
const DAY_PICK_PAD = 14;
/** 고른 날 패널에서 제안할 연차 상한. 4일 넘게 몰아 쓰는 건 징검다리가 아니라 그냥 장기 휴가다 */
const DAY_MAX_LEAVES = 3;

/**
 * 한 화면짜리 대시보드.
 * 최상단에 다가오는 일정 한 줄, 그 아래 왼쪽 달력 / 오른쪽 일정을 좌우로 배치한다.
 * 화면 상태(month·date·busy·hl)는 전부 URL에 있어서 링크만으로 동작한다.
 */
export default async function Home(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const t = today();

  // 구글 동의 화면에서 돌아온 결과. 클라이언트에서 쿼리를 읽지 않고 여기서 넘긴다 —
  // 그쪽에서 읽으면 effect 안 setState가 되어 렌더가 한 번 더 돈다.
  const gcal = first(sp.gcal);
  const gcalFlash =
    gcal === "ok"
      ? ({ kind: "ok", msg: "구글 캘린더를 연결했습니다." } as const)
      : gcal === "error"
        ? ({ kind: "error", msg: first(sp.gcalMsg) || "연결하지 못했습니다." } as const)
        : null;

  const rawMonth = first(sp.month);
  const month: MonthStr = isValidMonthStr(rawMonth) ? rawMonth : monthOf(t);

  const rawDate = first(sp.date);
  const selected: DateStr =
    isValidDateStr(rawDate) && monthOf(rawDate) === month ? rawDate : defaultDateFor(month, t);

  // 추천에서 넘어온 연휴 구간 'YYYY-MM-DD..YYYY-MM-DD' — 달력에서 구간 전체가 깜빡인다
  const rawHighlight = first(sp.hl) ?? "";
  const [hlStart, hlEnd] = rawHighlight.split("..");
  const highlightRange =
    isValidDateStr(hlStart) && isValidDateStr(hlEnd) && hlStart <= hlEnd
      ? { start: hlStart, end: hlEnd }
      : null;

  const weekStart = await getWeekStart();
  const grid = await buildMonth(month, weekStart);

  const coverage = await holidayCoverage();
  const horizonEnd = addDays(t, HORIZON_DAYS);
  const searchEnd = coverage && coverage.to < horizonEnd ? coverage.to : horizonEnd;

  // 이미 일정이 잡힌 날에는 연차를 낼 수 없다 — 후보 생성 단계에서 걸러 낸다
  const busy = new Set(await busyDates(t, searchEnd));

  // 보고 있는 해의 월별 공휴일 브리핑. 추천이 아니라 사실 요약이라
  // 지난 달도 빼지 않고 1월부터 12월까지 그대로 보여 준다.
  const viewYear = month.slice(0, 4);
  const briefing = new Map<string, { names: string[]; days: number }>();
  for (const h of await listHolidays(`${viewYear}-01-01`, `${viewYear}-12-31`)) {
    const key = h.date.slice(5, 7);
    const entry = briefing.get(key) ?? { names: [], days: 0 };
    const name = shortHolidayName(h.name);
    if (!entry.names.includes(name)) entry.names.push(name);
    entry.days += 1;
    briefing.set(key, entry);
  }
  const briefingRows = [...briefing.entries()].sort(([a], [b]) => a.localeCompare(b));
  // 연도 단추에 적는다. 숫자가 있어야 눌러 볼 이유가 생긴다 — '2026년'만 있으면 그냥 제목이다
  const holidayDaysInYear = briefingRows.reduce((sum, [, entry]) => sum + entry.days, 0);

  const dayEvents = await listEventsByDate(selected);
  // 같은 날 시각이 겹치는 일정. 저장을 막지는 않고 목록에 표시만 한다.
  // 클라이언트에서 계산하면 lib/events가 클라이언트 번들로 끌려오므로 여기서 구해 넘긴다.
  const dayConflicts = timeConflictIds(dayEvents);
  const doneCount = dayEvents.filter((e) => e.done).length;
  const selectedHoliday = await getHoliday(selected);

  // 연휴 추천을 꺼 뒀으면 계산 자체를 건너뛴다 — 감추기만 하면 매번 후보를 만드느라
  // 계산은 그대로 도는데, 이건 쓰지도 않을 결과를 매번 만드는 셈이다.
  const recsEnabled = await isRecommendationEnabled();

  // 고른 날이 **들어가는** 연휴 조합. 공휴일이 아니어도 된다 —
  // 평일을 골라도 "이 날을 연차로 쓰면 어떻게 되나"가 바로 나온다.
  // 조합이 하나도 없으면 아무것도 그리지 않는다.
  const dayFrom = maxDate(t, addDays(selected, -DAY_PICK_PAD));
  const dayTo = minDate(searchEnd, addDays(selected, DAY_PICK_PAD));

  const pickFor = async (includeHolidayFree: boolean) =>
    (
      await collectCandidates({
        from: dayFrom,
        to: dayTo,
        maxLeaves: DAY_MAX_LEAVES,
        busyDates: busy,
        includeHolidayFree,
      })
    )
      .filter((c) => c.start <= selected && selected <= c.end)
      // 연차를 적게 쓰는 순 → 같은 연차면 긴 순. "1일 쓰면 …, 2일 쓰면 …"으로 읽힌다
      .sort(
        (a, b) =>
          a.leaveCount - b.leaveCount ||
          b.totalDays - a.totalDays ||
          (a.start < b.start ? -1 : 1),
      );

  const withHolidays = recsEnabled && dayFrom <= dayTo ? await pickFor(false) : [];
  /**
   * 공휴일을 낀 조합이 하나도 없는 날 — 5월이나 11월처럼 공휴일이 비는 달이 실제로 있다.
   * 그럴 때 아무것도 안 그리면 "이 날 연차 쓰면 어떻게 되나"라는 질문 자체에 답을 못 한다.
   *
   * `lib/bridge.ts`가 공휴일 없는 구간을 기본으로 빼는 이유는 **목록을 도배하기 때문**인데,
   * 여기서는 고른 날이 들어가는 것만 남겨서 몇 줄 안 된다. 그 걱정이 적용되지 않는다.
   * 다만 그건 '황금연휴'가 아니라 그냥 주말 늘리기라, 아래에서 제목을 달리 붙인다.
   */
  const holidayFree = withHolidays.length === 0;
  const dayPicks =
    recsEnabled && holidayFree && dayFrom <= dayTo ? await pickFor(true) : withHolidays;

  // 항상 연차 수 하나를 고른 상태로 둔다. 기본은 가장 적게 쓰는 쪽.
  const leaveCounts = [...new Set(dayPicks.map((c) => c.leaveCount))].sort((a, b) => a - b);
  const rawLeave = Number(first(sp.lv));
  const pickedLeave = leaveCounts.includes(rawLeave) ? rawLeave : (leaveCounts[0] ?? null);
  const dayRows = dayPicks.filter((c) => c.leaveCount === pickedLeave);

  const all = await listEvents();
  // 앞으로 4주. 공휴일은 일정이 아니므로 이 줄에는 섞지 않는다.
  // 진행 중인 일정도 넣는다 — 시작일만 보면 오늘 시작한 일정과 어제 시작해
  // 오늘까지 이어지는 기간 일정이 두 목록 어디에도 안 나온다.
  // listEvents가 시작일 오름차순이라 이 배열이 곧 "가까운 순"이다.
  const upcoming = all.filter((e) => e.endDate >= t && e.date <= addDays(t, UPCOMING_DAYS));
  const upcomingShown = upcoming.slice(0, UPCOMING_LIMIT);
  const overdue = all.filter((e) => e.endDate < t && !e.done);

  const href = (params: {
    month?: MonthStr;
    date?: DateStr;
    /** 고른 날 패널에서 선택한 연차 수 */
    leave?: number | null;
    /** 달력에서 깜빡일 연휴 구간. 다른 링크로 이동하면 자연히 사라지도록 이어 붙이지 않는다 */
    highlight?: { start: DateStr; end: DateStr };
  }) => {
    const nextLeave = params.leave === undefined ? pickedLeave : params.leave;
    const q = new URLSearchParams({
      month: params.month ?? month,
      date: params.date ?? selected,
      lv: nextLeave === null ? "all" : String(nextLeave),
    });
    if (params.highlight) q.set("hl", `${params.highlight.start}..${params.highlight.end}`);
    return `/?${q}`;
  };

  const prevHref = href({ month: grid.prevMonth, date: defaultDateFor(grid.prevMonth, t) });
  const nextHref = href({ month: grid.nextMonth, date: defaultDateFor(grid.nextMonth, t) });
  const todayHref = href({ month: monthOf(t), date: t });

  // 해 단위 이동. 내년 연휴를 보려고 다음 달을 열두 번 누르는 일이 없도록 둔다.
  const prevYearMonth = addMonths(month, -12);
  const nextYearMonth = addMonths(month, 12);
  const prevYearHref = href({ month: prevYearMonth, date: defaultDateFor(prevYearMonth, t) });
  const nextYearHref = href({ month: nextYearMonth, date: defaultDateFor(nextYearMonth, t) });

  // 공휴일 데이터가 있는 해들 — 연도 브리핑 안에서 바로 건너뛰게 한다
  const coverageYears: number[] = [];
  if (coverage) {
    for (let y = Number(coverage.from.slice(0, 4)); y <= Number(coverage.to.slice(0, 4)); y++) {
      coverageYears.push(y);
    }
  }

  // 앞뒤로 가장 가까운 공휴일. 달을 하나씩 넘기며 찾을 필요가 없다.
  const prevHoliday = await adjacentHoliday(selected, "prev");
  const nextHoliday = await adjacentHoliday(selected, "next");

  // 머리말에 띄울 휴가 잔고. **오늘 기준**이다.
  //
  // 한때 고른 날짜를 넘겼는데, 그러면 9월을 보다가 12월을 누르는 것만으로 D-숫자가
  // 확 줄어든다. 소멸까지 남은 날은 **내가 오늘 몇 밤 남았나**를 묻는 값이라
  // 달력에서 어디를 보고 있는지와 상관이 없어야 한다. 주기도 같은 이유로 오늘 기준이다 —
  // 머리말의 잔고는 "그 날의 잔고"가 아니라 "내 잔고"다.
  const leaves = await leaveSummaries();
  // 일정 팝업이 고를 수 있는 종류. 고르는 데 필요한 것만 넘긴다
  // (클라이언트가 lib/leave를 import하면 @libsql/client가 번들로 끌려온다)
  const leaveTypes = leaves.map((l) => ({
    id: l.type.id,
    name: l.type.name,
    minUnit: l.type.minUnit,
  }));

  // 추천 아래 항공권 줄에 쓸 환율. **환산에 필요한 값만** 넘긴다 —
  // 환율표 전체를 늘어놓으면 달력보다 커진다. 못 받아도 화면은 그대로 그려진다 (lib/fx.ts 참고).
  // 오프라인이면 **부르지도 않는다.** 화면에서 감추기만 하면 서버는 여전히 밖으로 나가려다
  // 타임아웃을 먹고, 그만큼 페이지가 늦게 뜬다.
  const offline = await isOffline();
  // 알림 시점 선택은 설치본에서만 뜻이 있다 — 웹 배포본엔 이 알림 자체가 없다.
  const reminderThresholds = isDesktopApp() ? await getReminderThresholds() : [];
  const hourlyChime = isDesktopApp() ? await isHourlyChimeEnabled() : false;
  const hourlyChimeAnchor = isDesktopApp() ? await getHourlyChimeAnchor() : "09:00";
  const startTimeReminder = isDesktopApp() ? await isStartTimeReminderEnabled() : false;
  // 자격 증명(.env.local)이 없으면 구글 단추는 눌러도 "설정하세요" 안내만 나온다.
  // 눌러도 아무것도 안 되는 단추를 화면에 두지 않는다 — 채워 넣으면 그때 나타난다.
  const showGoogle = !offline && googleConfigured();
  const fx = offline ? null : await fxSnapshot();
  const quickRates = fx?.rates.map((r) => ({ code: r.code, perKrw: r.perKrw })) ?? [];

  /** 이 날에 등록된 일정이 있는가. 오른쪽 칸의 **주인공이 누구인지**를 이걸로 가른다 */
  const hasEvents = dayEvents.length > 0;

  /**
   * 그 날 업무 보고용 텍스트. 오른쪽 '그 날 일정' 칸에 붙는 단추라 그 칸이 보여 주는
   * 날짜 하나만 담는다 — 주간으로 묶으면 이 칸에서 보이지도 않는 다른 날짜가 같이
   * 복사돼 자리와 내용이 어긋난다.
   *
   * `dayEvents`(= listEventsByDate) 하나면 충분하다 — `date <= selected AND
   * end_date >= selected` 조건이라 하루짜리든 기간 일정이든 이 날에 걸쳐 있으면
   * 이미 다 들어 있다. 예전엔 여기에 `grid.spanning`에서 다시 뽑은 걸 한 번 더
   * 합쳤는데, 그러면 **기간 일정이 두 목록에 동시에 들어 있어 줄이 두 번씩** 찍혔다.
   * 한 줄에 하루짜리·기간 일정을 섞어 담지는 않는다 — 기간 일정은 자기 날짜 범위를
   * 그대로 적어야(예: "9월 30일~10월 2일") 언제까지인지 알 수 있어서다.
   */
  const dayCopyLines = dayEvents.map(
    (e) => `- ${formatRangeKo(e.date, e.endDate)}: ${e.title}`,
  );

  /**
   * 연휴 추천 덩어리. 자리를 두 군데 쓰기 때문에 변수로 뽑아 둔다 —
   * 일정이 없는 날에는 목록 **위에** 펼쳐서, 있는 날에는 목록 **아래에 접어서** 놓는다.
   * 같은 JSX를 두 번 적으면 한쪽만 고치는 사고가 난다.
   */
  const mgShejiPanel =
    dayRows.length > 0 ? (
                <div className="border-b border-border px-4 py-3">
                  {/* 제목은 뺐다. 아래 칩이 이미 무슨 목록인지 말해 주고,
                      공휴일이 없는 주에는 그 이름이 사실과도 맞지 않았다 */}
                  {/* **한 문장으로 읽히게** 둔다 — `연차 [2일] 쓰는 황금연휴`.
                      예전 라벨은 `연차 사용일수`였는데, 그러면 이미 쓴 연차를 세어 놓은
                      지표처럼 읽힌다. 이건 지표가 아니라 **"며칠 쓸까"를 고르는 자리**이고
                      아래 목록이 그 답이다. 칩을 문장 가운데 끼워 넣으면 고르는 동작과
                      그 결과가 한 줄 안에서 이어진다.
  
                      공휴일이 있는 주에는 `황금연휴`라고 표시한다. 공휴일이 없는 주에
                      나오는 것은 주말을 늘린 것뿐이라 제목을 달리 표시한다. */}
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Hint
                      text={
                        holidayFree
                          ? "이 주엔 공휴일이 없어 주말만 이어 붙인 조합입니다. 그래도 하루 쓰면 며칠 쉬는지는 볼 수 있습니다."
                          : "고른 날이 들어가는 연휴 조합만 보여 줍니다. 이미 하루 종일 일정이 있는 날은 연차를 못 내므로 빠집니다."
                      }
                    >
                      <span className="font-medium text-foreground">연차</span>
                    </Hint>
                    <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-background p-0.5">
                      {leaveCounts.map((n) => (
                        <LeaveChip
                          key={n}
                          label={`${n}일`}
                          active={pickedLeave === n}
                          href={href({ leave: n })}
                        />
                      ))}
                    </div>
                    <span className="text-muted">
                      {holidayFree ? (
                        "쓰면 이렇게 쉽니다"
                      ) : (
                        <>
                          쓰는 <span className="font-medium text-leave">🌟 황금 연휴</span>
                        </>
                      )}
                    </span>
                  </div>
  
                  {/* 목록·로고·연차 등록을 한 줄에 모아 그린다 (중복된 날짜 줄이 사라졌다) */}
                  <TripQuickLinks
                    trips={dayRows.map((c) => ({
                      start: c.start,
                      end: c.end,
                      leaveCount: c.leaveCount,
                      leaveDates: c.leaveDates,
                      totalDays: c.totalDays,
                      leaveLabel: c.leaveDates.map(formatShortKo).join(", "),
                      rangeLabel: `${formatShortKo(c.start)} ~ ${formatShortKo(c.end)}`,
                      // 달을 같이 넘겨야 한다. 안 넘기면 다른 달 연차일은 버려지고 선택이 리셋된다
                      href: href({
                        month: monthOf(c.leaveDates[0]),
                        date: c.leaveDates[0],
                        highlight: { start: c.start, end: c.end },
                      }),
                      note: `연차 ${c.leaveCount}일 ${c.leaveDates
                        .map(formatShortKo)
                        .join(", ")} · ${c.totalDays}일 연휴`,
                    }))}
                    rates={quickRates}
                    fxDate={fx?.date ?? null}
                    offline={offline}
                  />
                </div>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6">
      <Onboarding />
      <Shortcuts prevHref={prevHref} nextHref={nextHref} todayHref={todayHref} />
      {/* 왼쪽에 제목과 도움말, 오른쪽에 검색. 부제(일정 · 공휴일 · 연차)는 지웠다 —
          화면을 보면 알 수 있는 말이고, 자세한 설명은 도움말이 맡는다 */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          {/* 커서를 2초 올려 두면 이 앱이 뭘 하는지가 뜬다. 제목 옆에 부제를 늘 붙여 두면
              매일 보는 사람에게는 그냥 소음이라, 궁금할 때만 나오게 했다 */}
          <Hint text="일정과 연차를 한 화면에서 관리합니다. 달력에서 날짜를 고르면 오른쪽에 그 날의 일정과 황금 연휴가 함께 나옵니다.">
            <h1 className="flex items-center gap-1.5 text-lg font-bold tracking-tight">
              <img src="/icon.svg" alt="" aria-hidden className="h-5 w-5" />
              <span className="text-accent">MG</span> 매니지
            </h1>
          </Hint>

          <HelpButton desktop={isDesktopApp()} />
          <FeatureGuideButton desktop={isDesktopApp()} />
          <DisplaySettingsButton />
          <CalendarSettingsButton weekStart={weekStart} />
          {/* 온라인/오프라인 · 알림 시점을 한데 모은 팝업.
              헤더에 알약 단추를 하나씩 늘어놓지 않는다 */}
          <SettingsPanel
            offline={offline}
            offlineLocked={process.env.OFFLINE_DEFAULT === "1"}
            isDesktop={isDesktopApp()}
            reminderOptions={REMINDER_THRESHOLD_OPTIONS}
            reminderSelected={reminderThresholds}
            hourlyChime={hourlyChime}
            hourlyChimeAnchor={hourlyChimeAnchor}
            startTimeReminder={startTimeReminder}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {/* 연차를 언제 쓸지 추천하면서 몇 개 남았는지를 안 보여 주면 반쪽이라 헤더에 둔다.
              황금 연휴가 이 앱의 대표 기능이라 먼저 두고, D-Day는 뒤이은 연차·특별휴가
              D-day 타일과 "날짜를 센다"는 성격이 같아 그 옆으로 옮겼다. */}
          <HolidayFinderButton enabled={recsEnabled} />
          <DDayButton events={all} />
          <LeaveBudgetButton leaves={leaves} />
        </div>
      </header>

      {/* 달력보다 위, 한 줄. 둘 다 **날짜와 무관하게 전체 일정**을 다루는 도구라 나란히 둔다 —
          다가오는 일정은 앞을 내다보고, 검색은 뒤를 되짚는다.
          아래 달력/일정과 **같은 12칸 격자(7:5)**를 쓴다. 폭이 어긋나면 네 칸이
          제각각 놓인 것처럼 보인다. 좁은 화면에서는 세로로 쌓인다.

          다가오는 일정은 **딱 한 줄**이다. 가로 스크롤도, 줄바꿈도 두지 않는다 —
          스크롤은 밀어야 보이니 사실상 안 보이는 것이고, 줄바꿈은 일정이 늘 때마다
          위 칸이 커져 달력을 밀어낸다. 대신 개수를 UPCOMING_LIMIT으로 묶고
          제목은 잘라 넣는다. 나머지는 '+N건' 팝업이 맡는다. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <section className="flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-4 py-2 shadow-sm lg:col-span-7">
          <h2 className="shrink-0 text-xs font-semibold">
            다가오는 일정{" "}
            <span className="font-normal text-muted">{upcoming.length}건</span>
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted">앞으로 2주 안에 등록된 일정이 없습니다.</p>
          ) : (
            <ul className="flex min-w-0 flex-1 items-center gap-1.5">
              {upcomingShown.map((e) => (
                <li key={e.id} className="min-w-0">
                  <Link
                    href={href({ month: monthOf(e.date), date: e.date })}
                    scroll={false}
                    title={e.title}
                    className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-border hover:bg-accent-soft hover:ring-accent"
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorHex(e.color) }}
                    />
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatShortKo(e.date)}
                      {e.endDate > e.date && ` ~ ${formatShortKo(e.endDate)}`}
                    </span>
                    <span className="truncate font-medium">{e.title}</span>
                  </Link>
                </li>
              ))}
              {upcoming.length > UPCOMING_LIMIT && (
                <li className="ml-auto shrink-0">
                  <UpcomingMoreButton
                    events={upcoming}
                    hiddenCount={upcoming.length - UPCOMING_LIMIT}
                    days={UPCOMING_DAYS}
                  />
                </li>
              )}
            </ul>
          )}
        </section>

        {/* 검색과 챗봇은 고른 날과 무관하게 전체를 훑는다. 그래서 '그 날 일정' 칸에 붙이지 않는다 —
            그 안에 있으면 결과까지 그 날 것으로 읽힌다 */}
        {/* col-start를 못 박아 둔다 — 다가오는 일정이 없는 날에도 오른쪽 칸에 그대로 머문다 */}
        {/* 검색과 챗봇을 **한 줄로 합쳤다.** 따로 두면 두 줄이 되어 그만큼 달력이
            아래로 밀리고, 사용자도 "치과"를 어디에 쳐야 하는지 매번 판단해야 했다 */}
        <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm lg:col-span-5 lg:col-start-8">
          <OmniSearch offline={offline} chat={isChatEnabled()} />
        </section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        {/* ── 왼쪽: 달력 ───────────────────────────────── */}
        <section className="lg:col-span-7">
          {/* 줄바꿈을 막는다(flex-nowrap). 자리가 모자라면 다음 줄로 넘기는 대신
              **공휴일 이름을 줄인다** — 넘어가는 순간 달력 위 높이가 달라져
              그리드가 통째로 아래로 밀린다. 이름은 title 툴팁에 온전히 남는다. */}
          <div className="mb-2 flex flex-nowrap items-center justify-between gap-2">
            <div className="flex shrink-0 items-center gap-1.5">
              {/* 겹화살표는 해 단위, 홑화살표는 달 단위. 브라우저 이전/다음과 같은 관습이다 */}
              <Link
                href={prevYearHref}
                scroll={false}
                aria-label={`이전 해 — ${prevYearMonth.slice(0, 4)}년`}
                title={`${prevYearMonth.slice(0, 4)}년으로`}
                className="rounded-lg border border-border px-2 py-1 text-sm text-muted hover:border-accent hover:text-accent"
              >
                &laquo;
              </Link>
              <Link
                href={prevHref}
                scroll={false}
                aria-label="이전 달"
                title="이전 달"
                className="rounded-lg border border-border px-2.5 py-1 text-sm text-muted hover:border-accent hover:text-accent"
              >
                &lsaquo;
              </Link>
              {/* 연도를 누르면 그 해 공휴일이 펼쳐진다. <details>라 대부분 클라이언트 JS가
                  없고, 바깥 클릭·Esc로 닫는 것만 DetailsOutsideClose가 얇게 맡는다(안의
                  내용은 그대로 서버가 그린다). 한동안 그냥 글자였더니 누를 수 있다는 걸
                  아무도 몰랐다 — 테두리로 단추처럼 보이게 하고, 공휴일 일수와 화살표를
                  붙여 **누를 이유**까지 적어 둔다. */}
              <DetailsOutsideClose className="group relative">
                <summary
                  title={`${viewYear}년 공휴일 월별로 보기`}
                  className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border px-2 py-1 hover:border-accent hover:bg-accent-soft hover:text-accent group-open:border-accent group-open:bg-accent-soft group-open:text-accent [&::-webkit-details-marker]:hidden"
                >
                  <span className="text-base font-semibold">{viewYear}년</span>
                  {recsEnabled && holidayDaysInYear > 0 && (
                    <span className="text-[10px] text-holiday">공휴일 {holidayDaysInYear}일</span>
                  )}
                  <span
                    aria-hidden
                    className="text-[9px] leading-none text-muted transition-transform group-open:rotate-180"
                  >
                    ▼
                  </span>
                </summary>
                <div className="absolute left-0 top-full z-20 mt-1 w-[min(32rem,80vw)] rounded-xl border border-border bg-raised p-3 shadow-lg">
                  <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold">
                    <span>
                      {viewYear}년{recsEnabled && " 공휴일"}
                      {recsEnabled && (
                        <>
                          {" "}
                          <span className="font-normal text-holiday">{holidayDaysInYear}일</span>
                        </>
                      )}
                    </span>
                    {/* 칸이 링크라는 것도 안 보이면 같은 실수를 반복한다 */}
                    <span className="font-normal text-[10px] text-muted">
                      달을 누르면 그 달로 이동합니다 · 바깥 클릭 또는 Esc로 닫기
                    </span>
                  </p>

                  {/* 해를 바꿔 가며 훑는 자리라 여기에도 연도를 둔다.
                      공휴일 데이터가 있는 해만 — 없는 해로 보내 놓고 빈 화면을 보여 줄 이유가 없다 */}
                  {coverageYears.length > 1 && (
                    <div className="mb-2 flex flex-wrap items-center gap-0.5 rounded-lg bg-background p-0.5">
                      {coverageYears.map((y) => {
                        const target = `${y}-${month.slice(5, 7)}`;
                        return (
                          <Link
                            key={y}
                            href={href({ month: target, date: defaultDateFor(target, t) })}
                            scroll={false}
                            aria-current={String(y) === viewYear ? "true" : undefined}
                            className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                              String(y) === viewYear
                                ? "bg-surface font-semibold text-accent shadow-sm"
                                : "text-muted hover:text-foreground"
                            }`}
                          >
                            {y}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  {briefingRows.length === 0 ? (
                    <p className="text-[11px] text-muted">공휴일 데이터가 없는 해입니다.</p>
                  ) : (
                    <ul className="grid grid-cols-3 gap-1.5">
                      {briefingRows.map(([mm, entry]) => {
                        const isCurrent = `${viewYear}-${mm}` === month;
                        return (
                          <li key={mm}>
                            <Link
                              href={href({
                                month: `${viewYear}-${mm}`,
                                date: `${viewYear}-${mm}-01`,
                              })}
                              scroll={false}
                              className={`flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                                isCurrent
                                  ? "bg-accent-soft text-accent"
                                  : "bg-background hover:bg-accent-soft/60"
                              }`}
                            >
                              <span className="flex items-baseline justify-between gap-1">
                                <span className="text-xs font-semibold">{Number(mm)}월</span>
                                {/* 월 이동(네비게이션)은 연휴 추천과 무관하게 남긴다 —
                                    공휴일 며칠·이름만 연휴 추천이 꺼지면 같이 숨긴다 */}
                                {recsEnabled && (
                                  <span className="text-[10px] text-muted">{entry.days}일</span>
                                )}
                              </span>
                              {recsEnabled && (
                                <span className="truncate text-[11px] text-holiday">
                                  {entry.names.join(" · ")}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </DetailsOutsideClose>
              <h2 className="text-base font-semibold">{Number(month.slice(5, 7))}월</h2>
              <Link
                href={nextHref}
                scroll={false}
                aria-label="다음 달"
                title="다음 달"
                className="rounded-lg border border-border px-2.5 py-1 text-sm text-muted hover:border-accent hover:text-accent"
              >
                &rsaquo;
              </Link>
              <Link
                href={nextYearHref}
                scroll={false}
                aria-label={`다음 해 — ${nextYearMonth.slice(0, 4)}년`}
                title={`${nextYearMonth.slice(0, 4)}년으로`}
                className="rounded-lg border border-border px-2 py-1 text-sm text-muted hover:border-accent hover:text-accent"
              >
                &raquo;
              </Link>
              <Link
                href={todayHref}
                scroll={false}
                title={`오늘로 이동 — ${formatKo(t)}`}
                className="ml-1 shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent"
              >
                오늘 <span className="font-medium text-foreground">{formatShortKo(t)}</span>
              </Link>
            </div>

            {/* 공휴일 탐색 — 이름을 같이 적어 어디로 가는지 보이게 한다.
                연도 브리핑이 '한 해를 훑는' 도구라면 이쪽은 '지금 자리에서 다음 쉬는 날'이다.
                한동안 겹친다고 보고 내렸었는데, 묻는 질문이 서로 달라 되살렸다.
                황금연휴를 꺼 두면 공휴일 자체에 관심이 없다는 뜻이라 같이 숨긴다. */}
            {recsEnabled && (
              <div className="flex min-w-0 shrink items-center gap-1">
                {/* 좁아지면 이 라벨부터 사라진다. 화살표와 이름만 남아도 뜻은 통한다 */}
                <span className="hidden shrink-0 text-[11px] text-muted sm:inline">공휴일 탐색</span>
                <HolidayJump holiday={prevHoliday} direction="prev" hrefFor={href} />
                <HolidayJump holiday={nextHoliday} direction="next" hrefFor={href} />
              </div>
            )}
          </div>

          <CalendarGrid
            month={grid}
            selected={selected}
            hrefFor={(d) => href({ month: monthOf(d), date: d })}
            weekStart={weekStart}
            highlightRange={highlightRange}
            highlightKey={rawHighlight}
          />

          {/* 서버를 거치지 않는 개인용 체크리스트. 달력 바로 아래 — 일정과는 다른
              성격(등록 절차 없는 낙서장)이라 오른쪽 '그 날 일정' 칸과는 분리해 둔다 */}
          <div className="mt-4">
            <TodoList />
          </div>
        </section>

        {/* ── 오른쪽: 일정 ─────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          {/* 일정이 하나도 없을 때만. 처음 열었을 때 무엇부터 할지 알려 준다 */}
          {all.length === 0 && (
            <section className="rounded-xl border border-dashed border-border bg-surface px-4 py-4 text-sm shadow-sm">
              <p className="font-semibold">아직 등록한 일정이 없습니다</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-muted">
                <li>
                  달력에서 날짜를 누르고 <span className="font-medium text-foreground">+ 일정 추가</span>{" "}
                  (또는 <kbd className="rounded border border-border px-1 font-sans">N</kbd>)
                </li>
                {recsEnabled && (
                  <li>
                    <span className="font-medium text-leave">연차 등록</span>을 누르면 황금 연휴 추천이
                    바로 일정이 됩니다
                  </li>
                )}
              </ul>
            </section>
          )}
          <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                {formatKo(selected)}
                {selected === t && <span className="ml-1.5 text-xs text-accent">오늘</span>}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {dayEvents.length > 0 ? `${doneCount} / ${dayEvents.length} 완료` : "0건"}
                </span>
                <CopyDayButton lines={dayCopyLines} />
                <AddEventButton defaultDate={selected} leaveTypes={leaveTypes} />
              </div>
            </div>

            {/* 공휴일은 고치거나 지울 수 없는 사실이라 일정 목록 위에 따로 얹는다 */}
            {selectedHoliday && (
              <p className="flex items-center gap-2 border-b border-border px-4 py-2">
                <span className="rounded bg-holiday/10 px-1.5 py-0.5 text-[11px] font-semibold text-holiday">
                  공휴일
                </span>
                <span className="text-sm text-holiday">{selectedHoliday.name}</span>
              </p>
            )}

            {/* 고른 날이 들어가는 연휴 조합. 없으면 이 블록 자체가 안 그려진다 */}
            {/* 추천이 비는 이유가 "이미 그 날 일정이 있어서"일 때만. 이 규칙은 화면에
                드러나지 않아 안 적으면 왜 사라졌는지 알 길이 없다 — 대신 짧게 적는다 */}
            {recsEnabled && dayRows.length === 0 && busy.has(selected) && (
              <p className="border-b border-border px-4 py-2 text-[11px] text-muted">
                일정이 있는 날이라 연차 추천은 건너뜁니다
              </p>
            )}

            {/* 일정이 없는 날에는 추천이 이 칸의 **답**이라 목록보다 위에 온다.
                일정이 있는 날에는 아래로 내려가 접힌다 — 그 날의 답은 "오늘 뭐 하지"이지
                "연차 언제 쓰지"가 아니기 때문이다. 아래 hasEvents 참고 */}
            {!hasEvents && mgShejiPanel}

            <EventList
              events={dayEvents}
              showDate={false}
              emptyText="이 날 등록된 일정이 없습니다."
              conflictIds={dayConflicts}
              leaveTypes={leaveTypes}
            />

            {/* 일정이 있는 날 — 추천은 목록 **아래에 접어** 둔다.
                브라우저 기본 <details>라 클라이언트 JS가 붙지 않는다(연도 브리핑과 같은 방식). */}
            {hasEvents && mgShejiPanel !== null && (
              <details className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-[11px] text-muted marker:hidden hover:text-accent">
                  <span
                    aria-hidden
                    className="text-[9px] leading-none transition-transform group-open:rotate-90"
                  >
                    ▶
                  </span>
                  {holidayFree ? "연차 쓰면 며칠 쉬나 보기" : "🌟 황금 연휴 보기"}
                </summary>
                {mgShejiPanel}
              </details>
            )}

          </section>

          {overdue.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
                <Hint text="날짜가 지났는데 아직 완료 표시를 하지 않은 일정입니다. 체크하거나 +1일로 미루면 사라집니다.">
                  <h2 className="text-sm font-semibold text-muted">밀린 일정</h2>
                </Hint>
                <span className="text-xs text-holiday">{overdue.length}건</span>
              </div>
              <EventList events={overdue} />
            </section>
          )}
        </div>
      </div>
      {/* 백업과 구글 연동은 하루에 한 번도 안 누르는 것들이라 맨 아래에 조용히 둔다.
          구글 쪽은 붙여 놓기만 하면 알아서 도는 것이 목적이라 더 그렇다 */}
      <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <BackupButton />
        {/* 오프라인이거나 설정이 비어 있으면 아예 안 보인다.
            오프라인에서는 구글에 닿지 않고, 설정이 없으면 연결 자체가 안 된다 */}
        {showGoogle && <GoogleCalendarButton flash={gcalFlash} />}
        {/* 직원 개인이 혼자 쓰려고 만든 비공식 도구라는 점을 못박아 둔다.
            회사가 만든 것으로 오해되면 안 되기 때문이다. 로고는 뺐다 — 실제 회사
            상표를 출처 확인 없이 쓸 수 없어서다 */}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted opacity-70">
          MG 매니지 · 일정 관리 도구
        </span>
      </footer>
    </main>
  );
}


/** 앞뒤 공휴일로 건너뛰는 버튼. 갈 곳이 없으면 자리만 비운다 */
function HolidayJump({
  holiday,
  direction,
  hrefFor,
}: {
  holiday: Holiday | null;
  direction: "prev" | "next";
  hrefFor: (params: { month: MonthStr; date: DateStr }) => string;
}) {
  if (!holiday) return null;

  const arrow = direction === "prev" ? "‹" : "›";
  return (
    <Link
      href={hrefFor({ month: monthOf(holiday.date), date: holiday.date })}
      scroll={false}
      title={`${formatKo(holiday.date)} ${holiday.name}`}
      className="flex min-w-0 shrink items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:border-holiday hover:text-holiday"
    >
      {direction === "prev" && <span className="shrink-0">{arrow}</span>}
      {/* 6rem이 상한이고, 자리가 더 좁으면 그 아래로도 줄어든다(min-w-0).
          '부처님오신날 대체공휴일' 같은 긴 이름이 줄을 넘기지 않게 하는 장치다 */}
      <span className="min-w-0 max-w-[6rem] truncate">{holiday.name}</span>
      {direction === "next" && <span className="shrink-0">{arrow}</span>}
    </Link>
  );
}

/** 트랙 안에서 선택된 것만 떠오르는 작은 세그먼트 조각 */
function LeaveChip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
        active
          ? "bg-surface font-semibold text-accent shadow-sm"
          : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * 브리핑에 쓸 짧은 이름.
 * '추석 연휴'·'개천절 대체공휴일'은 같은 연휴의 일부라 한 이름으로 묶고,
 * '제9회 전국동시지방선거일'처럼 긴 이름은 줄여야 카드 폭이 무너지지 않는다.
 */
function shortHolidayName(name: string): string {
  return name
    .replace(/ 대체공휴일$/, "")
    .replace(/ 연휴$/, "")
    .replace(/^제\d+회 전국동시/, "")
    .replace(/선거일$/, "선거");
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function minDate(a: DateStr, b: DateStr): DateStr {
  return a < b ? a : b;
}

function maxDate(a: DateStr, b: DateStr): DateStr {
  return a > b ? a : b;
}

/** 그 달에 오늘이 들어 있으면 오늘, 아니면 1일 */
function defaultDateFor(month: MonthStr, t: DateStr): DateStr {
  return t >= monthStart(month) && t <= monthEnd(month) ? t : monthStart(month);
}
