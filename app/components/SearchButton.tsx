"use client";

import { useRef, useState } from "react";
import type { Event } from "@/lib/events";
import EventList from "./EventList";

/**
 * 일정 검색 팝업.
 *
 * 서버 렌더 대신 클라이언트에서 `/api/events?q=`를 부른다. 검색 결과를 URL에 실으면
 * 팝업이 아니라 페이지 일부가 되고, 뒤로 가기 기록도 검색어마다 쌓인다.
 */
export default function SearchButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Event[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setError("검색하지 못했습니다.");
        return;
      }
      setResults((await res.json()).events as Event[]);
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
      >
        일정 검색
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        aria-labelledby="search-dialog-title"
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-left text-foreground shadow-lg backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="search-dialog-title" className="text-sm font-semibold">
            일정 검색
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="닫기"
            className="rounded-md px-2 py-0.5 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form onSubmit={search} className="flex gap-2 border-b border-border p-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 · 메모로 찾기"
            aria-label="검색어"
            className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {loading ? "찾는 중…" : "찾기"}
          </button>
        </form>

        {error && (
          <p role="alert" className="px-4 py-3 text-sm text-red-500">
            {error}
          </p>
        )}

        {results !== null && (
          <>
            <p className="px-4 pt-3 text-xs text-muted">{results.length}건</p>
            <div className="max-h-[calc(60vh/var(--app-zoom,1))] overflow-y-auto">
              <EventList events={results} emptyText="찾는 일정이 없습니다." />
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
