"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/tasks";

/**
 * 기간 일정에 딸린 준비물 목록.
 *
 * 펼칠 때 처음 한 번만 불러온다. 목록에 기간 일정이 여러 건 있어도 열지 않은 것은
 * 요청이 없다 (개수 `준비물 2/5`는 일정 조회가 서브쿼리로 같이 가져온 값이다).
 *
 * 항목 자체는 이 컴포넌트의 state로 관리하고, 끝에서 `router.refresh()`로
 * 서버가 센 개수를 다시 받는다. 개수 배지와 목록이 어긋나지 않게 하려는 것이다.
 */
export default function EventChecklist({ eventId }: { eventId: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/events/${eventId}/tasks`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setTasks(d.tasks ?? []);
      })
      .catch(() => {
        if (alive) setError("준비물을 불러오지 못했습니다.");
      });
    // 목록을 접었다 펴는 사이에 응답이 오면 사라진 컴포넌트에 setState한다
    return () => {
      alive = false;
    };
  }, [eventId]);

  /** 서버가 센 개수 배지를 맞추기 위한 갱신 */
  const syncCount = () => startTransition(() => router.refresh());

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "추가하지 못했습니다.");
        return;
      }
      setTasks((prev) => [...(prev ?? []), data.task as Task]);
      setText("");
      syncCount();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(task: Task) {
    // 체크는 즉시 반영한다 — 준비물은 짐을 싸며 연달아 누르는 동작이라
    // 왕복을 기다리면 손이 멈춘다. 실패하면 되돌린다.
    setTasks((prev) =>
      (prev ?? []).map((t) => (t.id === task.id ? { ...t, done: !t.done } : t))
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !task.done }),
      });
      if (!res.ok) throw new Error();
      syncCount();
    } catch {
      setTasks((prev) => (prev ?? []).map((t) => (t.id === task.id ? { ...t, done: task.done } : t)));
      setError("저장하지 못했습니다.");
    }
  }

  async function remove(task: Task) {
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      syncCount();
    } catch {
      setTasks((prev) => [...(prev ?? []), task].sort((a, b) => a.id - b.id));
      setError("삭제하지 못했습니다.");
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-background p-2">
      {tasks === null ? (
        <p className="px-1 py-0.5 text-[11px] text-muted">불러오는 중…</p>
      ) : tasks.length === 0 ? (
        <p className="px-1 py-0.5 text-[11px] text-muted">
          챙길 것을 적어 두세요. 예약 · 짐 · 환전
        </p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 px-1 py-0.5">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => toggle(task)}
                aria-label={`${task.text} 완료`}
                className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
              />
              <span
                className={`min-w-0 flex-1 break-words text-xs ${
                  task.done ? "text-muted line-through" : ""
                }`}
              >
                {task.text}
              </span>
              <button
                type="button"
                onClick={() => remove(task)}
                aria-label={`${task.text} 삭제`}
                className="shrink-0 rounded px-1 text-[11px] text-muted hover:text-red-500"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-1 flex gap-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="+ 챙길 것"
          aria-label="준비물 추가"
          maxLength={100}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="shrink-0 rounded border border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          추가
        </button>
      </form>

      {error && <p className="mt-1 px-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
