"use client";

import { useEffect, useState, type FormEvent } from "react";

/**
 * 서버 없는 체크리스트. 일정(events)과는 다르게 등록 절차도 색도 기간도 없는
 * 그날그날의 낙서장이라 DB에 넣을 이유가 없다 — localStorage 하나로 충분하다.
 */
type Todo = { id: string; text: string; done: boolean };

const KEY = "local-todos";

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  // localStorage를 읽기 전에 빈 배열을 그대로 저장해 버리면 기존 내용이 지워진다.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setTodos(JSON.parse(raw) as Todo[]);
    } catch {
      // 손상된 값이거나 접근 불가 — 빈 목록으로 시작한다
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(todos));
    } catch {
      // 저장 실패해도 화면은 계속 쓴다
    }
  }, [todos, loaded]);

  function add(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setTodos((prev) => [...prev, { id: crypto.randomUUID(), text: t, done: false }]);
    setText("");
  }

  function toggle(id: string) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function remove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  const doneCount = todos.filter((t) => t.done).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">오늘 할 일</h2>
        <span className="text-xs text-muted">
          {todos.length > 0 ? `${doneCount} / ${todos.length} 완료` : "0건"}
        </span>
      </div>

      <form onSubmit={add} className="flex items-center gap-2 border-b border-border px-4 py-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="할 일을 입력하고 Enter"
          aria-label="할 일 입력"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
      </form>

      {todos.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">아직 할 일이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-4 py-2">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
                aria-label={`${t.text} 완료`}
                className="h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  t.done ? "text-muted line-through" : "text-foreground"
                }`}
              >
                {t.text}
              </span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="삭제"
                className="shrink-0 rounded px-1.5 text-xs text-muted hover:text-foreground"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-border px-4 py-1.5 text-[10px] text-muted">
        이 목록은 이 기기에만 저장됩니다.
      </p>
    </section>
  );
}
