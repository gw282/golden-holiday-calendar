"use client";

/**
 * 설정 켜고/끄는 슬라이드 스위치. 네이티브 체크박스 그대로 쓰되(접근성·폼 동작은
 * 공짜로 받는다) 화면에서만 숨기고(`sr-only`) 옆에 그린 막대·동그라미를
 * `peer-checked`로 움직인다 — 새 상태나 이벤트 처리 없이 각 설정 팝업의
 * `checked`/`onChange`를 그대로 물려받는 얇은 겉모습 컴포넌트다.
 */
export default function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className={`relative inline-flex h-5 w-9 shrink-0 items-center ${disabled ? "" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-accent peer-disabled:opacity-50" />
      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </label>
  );
}
