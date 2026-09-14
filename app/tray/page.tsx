import { listEventsByDate } from "@/lib/events";
import { addDays, today } from "@/lib/date";
import { colorHex } from "@/lib/eventColors";
import OpenCalendarButton from "./OpenCalendarButton";

export const dynamic = "force-dynamic";

/** 퇴근 시각 — 이 시각을 넘기면 "오늘 남은 일정" 대신 "내일 첫 일정"을 보여준다 */
const END_OF_WORK_MIN = 18 * 60;

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 트레이 아이콘 클릭으로 뜨는 미니 팝업. 장식 없는 작은 웹뷰 창
 * (`src-tauri/src/lib.rs`의 "tray")에 바로 로드된다 — 메인 대시보드와 같은
 * 헤더·달력을 다시 그리지 않고, "지금 당장 궁금한 것"만 한 화면에 담는다.
 *
 * **분기 로직**: 오늘 남은(완료 안 한, 지금 이후 시작하거나 하루 종일인) 일정을
 * 시간순으로 보여준다. 남은 게 하나도 없거나 퇴근 시각(18시)을 지났으면
 * "오늘은 끝났다"는 뜻이므로 내일 첫 일정으로 넘어간다 — 오늘 칸이 텅 빈 채로
 * 남아 있는 것보다, 다음으로 볼 일정을 바로 보여주는 쪽이 트레이 팝업의 목적
 * (지금 당장 다음이 뭔지)에 맞는다.
 */
export default async function TrayPopupPage() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const t = today();

  const todaysEvents = await listEventsByDate(t);
  const remainingToday = todaysEvents
    .filter((e) => !e.done)
    .filter((e) => e.startTime === null || hhmmToMin(e.startTime) >= nowMin);

  const showTomorrow = nowMin >= END_OF_WORK_MIN || remainingToday.length === 0;

  const tomorrowFirst = showTomorrow
    ? (await listEventsByDate(addDays(t, 1))).filter((e) => !e.done).slice(0, 1)
    : [];

  const heading = showTomorrow ? "내일 첫 일정" : "오늘 남은 일정";
  const items = showTomorrow ? tomorrowFirst : remainingToday;

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-xl border border-border bg-surface text-foreground">
      {/* 장식 없는 창이라 제목표시줄이 없다 — 지금 몇 시 기준인지를 여기서 대신 보여준다 */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">{heading}</span>
        <span className="text-[10px] tabular-nums text-muted">
          {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")} 기준
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs text-muted">
            {showTomorrow ? "내일 등록된 일정이 없습니다." : "오늘 남은 일정이 없습니다."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-accent-soft/60"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorHex(e.color) }}
                />
                <span className="w-10 shrink-0 tabular-nums text-muted">
                  {e.startTime ?? "종일"}
                </span>
                <span className="truncate text-foreground">{e.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-2">
        <OpenCalendarButton />
      </div>
    </div>
  );
}
