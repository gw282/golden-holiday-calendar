"use client";

import { useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * 서버 없는 체크리스트. 일정(events)과는 다르게 등록 절차도 색도 기간도 없는
 * 그날그날의 낙서장이라 DB에 넣을 이유가 없다 — localStorage 하나로 충분하다.
 */
type Todo = { id: string; text: string; done: boolean };

const KEY = "local-todos";
const CHANNEL = "mg-todos";

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Todo[]) : [];
    } catch {
      // 손상된 값이거나 접근 불가 — 빈 목록으로 시작한다
      return [];
    }
  });
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(todos));
    } catch {
      // 저장 실패해도 화면은 계속 쓴다
    }
  }, [todos]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY || !event.newValue) return;
      try {
        setTodos(JSON.parse(event.newValue) as Todo[]);
      } catch {
        // 다른 창의 손상된 값은 무시하고 현재 목록을 유지한다.
      }
    };
    const channel = new BroadcastChannel(CHANNEL);
    const onMessage = (event: MessageEvent<Todo[]>) => setTodos(event.data);
    channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function publish(next: Todo[]) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      new BroadcastChannel(CHANNEL).postMessage(next);
    } catch {
      // 저장 실패해도 화면은 계속 쓴다.
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const next = [...todos, { id: crypto.randomUUID(), text: t, done: false }];
    setTodos(next);
    publish(next);
    setText("");
  }

  function toggle(id: string) {
    const next = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setTodos(next);
    publish(next);
  }

  function remove(id: string) {
    const next = todos.filter((t) => t.id !== id);
    setTodos(next);
    publish(next);
  }

  async function openWidget() {
    setWidgetError(null);
    try {
      await invoke("open_todo_widget");
    } catch (error) {
      // Tauri는 Result<T, String> 커맨드가 실패하면 Err의 **문자열 그대로**로
      // reject한다(Error 인스턴스가 아니다) — instanceof Error만 보면 실제
      // 원인이 항상 가려져서 "열지 못했습니다"만 반복해서 뜬다.
      const reason =
        error instanceof Error ? error.message : typeof error === "string" ? error : null;
      setWidgetError(reason ? `바탕화면 위젯을 열지 못했습니다: ${reason}` : "바탕화면 위젯을 열지 못했습니다.");
    }
  }

  async function copyAll() {
    if (todos.length === 0) return;
    const content = todos.map((todo) => todo.text).join("\n");
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const doneCount = todos.filter((t) => t.done).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">할 일</h2>
          {/* ponytail: 위젯 창이 Windows에서 투명 배경 없이 흰 화면으로만 뜨는 문제가
              안 풀려서 버튼을 일단 뺀다 — WebView2 투명 처리 원인 찾으면 되살릴 것 */}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">
            {todos.length > 0 ? `${doneCount} / ${todos.length} 완료` : "0건"}
          </span>
          {todos.length > 0 && (
            <button
              type="button"
              onClick={copyAll}
              className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              {copied ? "복사됨" : "전체 복사"}
            </button>
          )}
        </div>
      </div>
      {widgetError && (
        <p role="alert" className="border-b border-border px-4 py-2 text-[11px] text-red-500">
          {widgetError}
        </p>
      )}

      <form onSubmit={add} className="flex items-center gap-2 border-b border-border px-4 py-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="할 일을 입력한 후 엔터 또는 추가 버튼을 클릭하세요"
          aria-label="할 일 입력"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          추가
        </button>
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
    </section>
  );
}
