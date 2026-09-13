"use client";

import { useEffect, useState } from "react";
import { EVENT_COLORS } from "@/lib/eventColors";
import { countWorkdays, fmtDays, useHolidayDates, type LeaveTypeOption } from "./leaveDays";
import Hint from "./Hint";
import DatePicker from "./DatePicker";
import TimePicker from "./TimePicker";

/** 추가 폼과 수정 폼이 같은 입력을 쓰도록 모아 둔 것. 제출은 각자 한다. */
export type EventFieldValues = {
  title: string;
  date: string;
  /** 비우면 하루짜리 */
  endDate: string;
  /** 하루 종일이면 시각 입력을 쓰지 않는다 */
  allDay: boolean;
  /** 'HH:MM' 또는 빈 문자열 */
  startTime: string;
  endTime: string;
  memo: string;
  /** lib/eventColors.ts의 키. 빈 값이면 기본색 */
  color: string;
  /** 반복 주기. 빈 값이면 반복 없음 */
  repeatFreq: string;
  /** "몇 회"로 정할지 "몇 월 며칠까지"로 정할지 */
  repeatMode: "count" | "until";
  /** 반복 횟수 (첫 회차 포함) — repeatMode가 "count"일 때만 쓴다 */
  repeatCount: string;
  /** 반복 종료일 — repeatMode가 "until"일 때만 쓴다 */
  repeatUntil: string;
  /** 연차를 쓰는 일정인가 */
  isLeave: boolean;
  /** 어느 휴가인지 (leave_types.id). 빈 값이면 기본 종류 */
  leaveTypeId: string;
  /** 자동 계산과 다르게 낼 때만 채운다 (반차 0.5 · 반반차 0.25). 비우면 자동 */
  leaveDays: string;
  /** "" = 전역 알림 설정을 따름, "0" = 이 일정만 알림 끄기, 그 외엔 분(15/30/60/120) */
  reminderMinutes: string;
};

const REMINDER_OPTIONS = [
  { value: "", label: "기본(전역 설정)" },
  { value: "15", label: "15분 전" },
  { value: "30", label: "30분 전" },
  { value: "60", label: "1시간 전" },
  { value: "120", label: "2시간 전" },
  { value: "0", label: "이 일정은 알림 끄기" },
];

const REPEAT_OPTIONS = [
  { value: "", label: "반복 없음" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월 같은 날" },
  { value: "yearly", label: "매년 같은 날" },
];

const INPUT =
  "rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent disabled:opacity-40";

/**
 * <select>는 배경이 transparent면 다크 모드에서 목록이 흰 바탕으로 뜬다.
 * 닫혀 있을 때는 뒤의 팝업 색이 비쳐 멀쩡해 보이지만 펼치면 반전이 안 된 채로 나온다.
 */
const SELECT = `${INPUT} bg-surface [&>option]:bg-surface [&>option]:text-foreground`;

/** 한 줄짜리 설정 행 — 왼쪽에 이름, 오른쪽에 값 */
function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-12 shrink-0 text-xs text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * 일정 입력.
 *
 * **쓰지 않는 칸은 비활성이 아니라 아예 감춘다.** 예전에는 종료일·시각·반복 횟수가
 * 흐릿하게라도 늘 떠 있어서, 하루짜리 일정 하나를 넣는 데도 빈 칸 여섯 개를 지나야 했다.
 * 기본 상태(하루 종일·반복 없음·연차 아님)에서는 제목·날짜·갈래·메모만 보인다.
 */
export default function EventFields({
  value,
  onChange,
  disabled,
  allowRepeat = false,
  leaveTypes = [],
}: {
  value: EventFieldValues;
  onChange: (next: EventFieldValues) => void;
  disabled?: boolean;
  /** 고를 수 있는 휴가 종류. 서버가 넘긴다 (하나뿐이면 고르는 칸을 안 그린다) */
  leaveTypes?: LeaveTypeOption[];
  /** 반복은 새로 만들 때만 고를 수 있다. 이미 만든 묶음을 고치는 건 규칙이 복잡해 지원하지 않는다 */
  allowRepeat?: boolean;
}) {
  const set = <K extends keyof EventFieldValues>(key: K, v: EventFieldValues[K]) =>
    onChange({ ...value, [key]: v });

  // 알림 시점은 설치본(Tauri)에서만 뜻이 있다. 서버 prop으로 내려받는 대신
  // `window.__TAURI_INTERNALS__`(Tauri가 웹뷰에 직접 심어 주는 값)로 클라이언트에서
  // 바로 판단한다 — AddEventButton부터 여기까지 prop을 계속 이어 나를 필요가 없다.
  // 서버에는 window가 없어 처음엔 false로 그리고, 마운트 후 다시 확인한다.
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    setIsTauri(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
  }, []);

  // 기간 입력을 펼쳤는지. 값이 이미 있으면(수정 팝업) 펼친 채로 시작한다.
  const [showRange, setShowRange] = useState(value.endDate !== "");

  // 공휴일은 서버에만 있다. 한 번 받아 두고 연차 자동 계산에 쓴다 (모듈이 캐시한다).
  const holidays = useHolidayDates();
  const autoLeave = countWorkdays(value.date, value.endDate || value.date, holidays);
  const overridden = value.leaveDays.trim() !== "";

  // 고른 휴가의 최소 단위. 특별휴가처럼 하루 단위면 반차 칸을 아예 안 그린다 —
  // 넣을 수 없는 값을 받는 칸을 두면 저장할 때야 거절당한다.
  const pickedType =
    leaveTypes.find((t) => String(t.id) === value.leaveTypeId) ?? leaveTypes[0];
  const minUnit = pickedType?.minUnit ?? 0.25;

  return (
    <div className="flex flex-col gap-4">
      {/* 제목은 이 폼의 주인공이라 테두리 없이 크게 둔다 */}
      <input
        autoFocus
        value={value.title}
        onChange={(e) => set("title", e.target.value)}
        disabled={disabled}
        placeholder="무엇을 할 계획인가요?"
        aria-label="제목"
        className="w-full border-b border-border bg-transparent pb-2 text-lg text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent disabled:opacity-40"
      />

      <div className="flex flex-col gap-3">
        <Row label="날짜">
          <DatePicker
            value={value.date}
            onChange={(v) => set("date", v)}
            disabled={disabled}
            ariaLabel="시작일"
          />
          {showRange ? (
            <>
              <span aria-hidden className="text-xs text-muted">
                ~
              </span>
              <DatePicker
                value={value.endDate}
                min={value.date}
                onChange={(v) => set("endDate", v)}
                disabled={disabled}
                ariaLabel="종료일"
              />
              <button
                type="button"
                onClick={() => {
                  setShowRange(false);
                  set("endDate", "");
                }}
                disabled={disabled}
                className="rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:text-holiday"
              >
                하루로
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowRange(true)}
              disabled={disabled}
              className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              + 기간
            </button>
          )}
        </Row>

        <Row label="시각">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={value.allDay}
              // 하루 종일로 바꾸면 시각을 비운다. 남겨 두면 다시 껐을 때 옛 값이 되살아난다.
              onChange={(e) =>
                onChange({
                  ...value,
                  allDay: e.target.checked,
                  startTime: e.target.checked ? "" : value.startTime,
                  endTime: e.target.checked ? "" : value.endTime,
                })
              }
              disabled={disabled}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            하루 종일
          </label>

          {/* 하루 종일이면 시각 칸을 흐리게 두지 않고 아예 감춘다 */}
          {!value.allDay && (
            <>
              <TimePicker
                value={value.startTime}
                onChange={(v) => set("startTime", v)}
                disabled={disabled}
                ariaLabel="시작 시각"
              />
              <span aria-hidden className="text-xs text-muted">
                ~
              </span>
              <TimePicker
                value={value.endTime}
                onChange={(v) => set("endTime", v)}
                disabled={disabled || !value.startTime}
                ariaLabel="종료 시각"
              />
            </>
          )}
        </Row>

        {/* 색만 동그랗게 늘어놓으면 무슨 뜻인지 알 길이 없어 이름을 같이 적는다.
            라벨은 색 이름이 아니라 쓰임이다 (lib/eventColors.ts 참고) */}
        <Row label="갈래">
          {EVENT_COLORS.map((c) => {
            const picked = value.color === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => set("color", picked ? "" : c.key)}
                disabled={disabled}
                aria-pressed={picked}
                className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-[11px] transition-colors ${
                  picked
                    ? "border-foreground text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.hex }}
                />
                {c.label}
              </button>
            );
          })}
        </Row>

        {/* 연차. 며칠 쓰는지는 기간에서 주말·공휴일을 빼 자동으로 센다 —
            금~월을 쉬어도 연차는 이틀이라 기간 일수를 그대로 세면 잔고가 빨리 준다 */}
        <Row label={<Hint text="기간에서 주말·공휴일을 뺀 날수를 자동으로 셉니다. 반차 0.5·반반차 0.25는 오른쪽 칸에 직접 넣으세요.">휴가</Hint>}>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={value.isLeave}
              // 껐다 켜면 직접 넣은 값은 버리고 자동으로 돌아간다
              onChange={(e) => onChange({ ...value, isLeave: e.target.checked, leaveDays: "" })}
              disabled={disabled}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="font-semibold text-leave">
                {fmtDays(overridden ? Number(value.leaveDays) : autoLeave)}일
              </span>{" "}
              사용
            </span>
          </label>

          {/* 종류가 둘 이상일 때만 고르게 한다. 하나뿐이면 물어볼 것이 없다 */}
          {value.isLeave && leaveTypes.length > 1 && (
            <select
              value={value.leaveTypeId || String(leaveTypes[0].id)}
              onChange={(e) => onChange({ ...value, leaveTypeId: e.target.value, leaveDays: "" })}
              disabled={disabled}
              aria-label="휴가 종류"
              className={`${SELECT} py-1`}
            >
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {/* 하루 단위 휴가에는 직접 입력 칸을 두지 않는다 (반차를 못 쓴다) */}
          {value.isLeave && minUnit < 1 && (
            <input
              type="number"
              min={0}
              max={365}
              step={minUnit}
              value={value.leaveDays}
              onChange={(e) => set("leaveDays", e.target.value)}
              disabled={disabled}
              aria-label="휴가 일수 직접 입력"
              placeholder={`자동 ${fmtDays(autoLeave)}`}
              title="반차 0.5 · 반반차 0.25. 비우면 자동으로 셉니다"
              className={`${INPUT} w-24`}
            />
          )}
        </Row>

        {allowRepeat && (
          <Row label="반복">
            <select
              value={value.repeatFreq}
              onChange={(e) => set("repeatFreq", e.target.value)}
              disabled={disabled}
              aria-label="반복 주기"
              className={SELECT}
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* 반복을 고르지 않았으면 횟수·종료일 칸은 뜻이 없다 */}
            {value.repeatFreq && (
              <>
                <div className="flex items-center gap-0.5 rounded-lg bg-background p-0.5">
                  {(
                    [
                      { mode: "count", label: "횟수로" },
                      { mode: "until", label: "종료일까지" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.mode}
                      type="button"
                      onClick={() => set("repeatMode", o.mode)}
                      disabled={disabled}
                      className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                        value.repeatMode === o.mode
                          ? "bg-surface font-medium text-accent shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {value.repeatMode === "count" ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={value.repeatCount}
                      onChange={(e) => set("repeatCount", e.target.value)}
                      disabled={disabled}
                      aria-label="반복 횟수"
                      className={`${INPUT} w-20`}
                    />
                    <span className="text-[11px] text-muted">회 (첫 회 포함)</span>
                  </>
                ) : (
                  <DatePicker
                    value={value.repeatUntil}
                    onChange={(v) => set("repeatUntil", v)}
                    min={value.date}
                    disabled={disabled}
                    ariaLabel="반복 종료일"
                    placeholder="종료일 선택"
                  />
                )}
              </>
            )}
          </Row>
        )}

        {/* 시각이 있는 일정만 알림이 뜻이 있다 — 하루 종일 일정은 몇 시에 알릴지가 없다 */}
        {isTauri && !value.allDay && (
          <Row label="알림">
            <select
              value={value.reminderMinutes}
              onChange={(e) => set("reminderMinutes", e.target.value)}
              disabled={disabled}
              aria-label="알림 시점"
              className={SELECT}
            >
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
        )}

        <Row label="메모">
          <textarea
            value={value.memo}
            onChange={(e) => set("memo", e.target.value)}
            disabled={disabled}
            placeholder="선택 — 여러 줄로 적을 수 있습니다"
            rows={2}
            className={`${INPUT} min-w-0 flex-1 resize-y`}
          />
        </Row>
      </div>
    </div>
  );
}
