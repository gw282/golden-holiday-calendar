"use client";

/** 달력 칸 안의 일정 미리보기 한 줄. */
export default function EventPreviewChip({
  title,
  done,
  colorHex,
}: {
  title: string;
  done: boolean;
  colorHex: string;
}) {
  return (
    <span
      className={`flex items-center gap-1 truncate text-[11px] leading-tight ${
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
