import { listEventsByDate } from "@/lib/events";
import { today } from "@/lib/date";
import { colorHex } from "@/lib/eventColors";
import WidgetCloseButton from "../components/WidgetCloseButton";
import WidgetTodos from "../components/WidgetTodos";

// page.tsx와 같은 이유 — 매번 새로 읽어야 오늘 등록한 일정이 위젯에도 바로 보인다
export const dynamic = "force-dynamic";

/**
 * 바탕화면 위젯 — 오늘 일정 + 오늘 할 일.
 *
 * 일정은 DB에서 서버가 직접 읽어 온다(할 일과 달리 등록된 진짜 일정이라 로컬에
 * 없다). 읽기 전용이다 — 위젯은 창이 작아 수정 UI를 넣을 자리가 없고, 고치려면
 * 메인 창을 열면 된다. 할 일 체크리스트만 `WidgetTodos`로 클라이언트 경계를 둔다.
 */
export default async function TodoWidgetPage() {
  const events = await listEventsByDate(today());

  return (
    <main className="h-screen w-screen overflow-hidden rounded-2xl border border-yellow-200/60 bg-yellow-100/85 text-stone-800 shadow-2xl backdrop-blur-[10px] dark:border-slate-600/60 dark:bg-slate-900/85 dark:text-slate-100">
      <header
        data-tauri-drag-region
        className="flex h-11 items-center justify-between bg-yellow-300/55 px-4 text-sm font-semibold dark:bg-slate-700/70"
      >
        <span>할 일</span>
        <WidgetCloseButton />
      </header>

      <section className="h-[calc(100%-2.75rem)] overflow-y-auto p-3">
        <h2 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">
          오늘 일정 · {events.length}건
        </h2>
        {events.length === 0 ? (
          <p className="py-3 text-center text-xs opacity-65">등록된 일정이 없습니다.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-lg bg-white/35 px-2.5 py-2 dark:bg-white/10"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: e.done ? "transparent" : colorHex(e.color) }}
                />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${e.done ? "line-through opacity-50" : ""}`}
                >
                  {e.title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums opacity-60">
                  {e.startTime ? `${e.startTime}${e.endTime ? `~${e.endTime}` : ""}` : "하루 종일"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-4 px-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">
          할 일
        </h2>
        <div className="mt-1.5">
          <WidgetTodos />
        </div>
      </section>
    </main>
  );
}
