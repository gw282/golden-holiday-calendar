"use client";

import { useEffect, useState } from "react";

type Todo = { id: string; text: string; done: boolean };

const KEY = "local-todos";
const CHANNEL = "mg-todos";

function readTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Todo[]) : [];
  } catch {
    return [];
  }
}

/** 위젯의 할 일 체크리스트 — 메인 창 TodoList.tsx와 같은 localStorage 키를 그대로 읽고 쓴다 */
export default function WidgetTodos() {
  const [todos, setTodos] = useState<Todo[]>(readTodos);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL);
    const onMessage = (event: MessageEvent<Todo[]>) => setTodos(event.data);
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setTodos(readTodos());
    };
    channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggle(id: string) {
    const next = todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
    localStorage.setItem(KEY, JSON.stringify(next));
    new BroadcastChannel(CHANNEL).postMessage(next);
    setTodos(next);
  }

  if (todos.length === 0) {
    return <p className="py-3 text-center text-xs opacity-65">등록된 할 일이 없습니다.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {todos.map((todo) => (
        <li
          key={todo.id}
          className="flex items-start gap-2 rounded-lg bg-white/35 px-2.5 py-2 dark:bg-white/10"
        >
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => toggle(todo.id)}
            aria-label={`${todo.text} 완료`}
            className="mt-0.5 h-4 w-4 shrink-0 accent-yellow-600"
          />
          <span
            className={`min-w-0 flex-1 break-words text-sm ${todo.done ? "line-through opacity-50" : ""}`}
          >
            {todo.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
