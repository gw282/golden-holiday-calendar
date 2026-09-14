"use client";

/**
 * 달력 칸 안의 일정 미리보기 한 줄 — 드래그 가능한 버전.
 *
 * `draggable`은 DOM 표준 드래그-앤-드롭이라 라이브러리가 필요 없다. 여기서는
 * `dataTransfer`에 일정 id만 담아 보낸다 — 놓는 쪽(`DayCellInteractive.tsx`)이
 * 그 id로 PATCH(이동)든 복사 POST든 알아서 부른다. 끄는 쪽은 "무엇을" 옮기는지만
 * 알면 되고, "어떻게" 반영할지는 놓는 쪽 책임으로 나눈 것이다.
 */
export default function EventDragChip({
  id,
  title,
  done,
  colorHex,
}: {
  id: number;
  title: string;
  done: boolean;
  colorHex: string;
}) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(id));
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      title="드래그해서 날짜 옮기기 · Ctrl+드래그: 복사"
      className={`flex cursor-grab items-center gap-1 truncate text-[11px] leading-tight active:cursor-grabbing ${
        done ? "text-muted line-through" : "text-foreground"
      }`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: done ? "var(--border)" : colorHex }}
      />
      <span className="truncate">{title}</span>
    </span>
  );
}
