"use client";

import { useState } from "react";
import Link from "next/link";
import type { Destination } from "@/lib/flights";
import {
  DESTINATIONS,
  FLIGHT_SITES,
  ORIGINS,
  STAY_SITES,
  findDestination,
  logoUrl,
} from "@/lib/flights";
import { FX_CURRENCIES, flagUrl } from "@/lib/currencies";
import BookLeaveButton from "./BookLeaveButton";

/** 추천 한 줄. 서버가 계산해 넘긴다 (함수는 못 넘기므로 주소·문구까지 만들어서) */
export type QuickTrip = {
  start: string;
  end: string;
  leaveCount: number;
  leaveDates: string[];
  totalDays: number;
  /** '10/2(금), 10/5(월)' */
  leaveLabel: string;
  /** '10/2(금) ~ 10/5(월)' */
  rangeLabel: string;
  /** 달력에서 이 구간을 보는 주소 */
  href: string;
  /** 연차 등록 시 메모 */
  note: string;
};

/** 원 1에 대한 상대 통화 값. 환율 한 줄에만 쓴다 */
export type QuickRate = { code: string; perKrw: number };

const SELECT =
  "rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-accent [&>option]:bg-surface [&>option]:text-foreground";

/**
 * 추천 연휴 목록 + 항공권·숙소 링크 + 환율.
 *
 * 세 덩이로 나눈다 — **연휴 목록 / 항공·숙소 / 환율**.
 * 예전에는 추천 목록과 항공권 목록이 따로 있어 같은 구간이 두 줄씩 나왔고,
 * 세 개만 떠도 칸이 열 줄을 넘었다. 사이트 링크는 이제 **한 줄만** 두고
 * 어느 구간 기준인지 날짜를 옆에 적는다.
 *
 * 노선과 인원은 URL이 아니라 이 컴포넌트의 state다. 도시를 바꿔 볼 때마다 서버를
 * 다녀오면 느리고, 주소에 남길 만한 상태도 아니다.
 * 그래서 목록도 서버가 아니라 여기서 그린다 — 줄마다 로고 주소가 그 선택을 따라야 한다.
 */
/** 기본 도착지 — 뉴욕 */
const DEFAULT_DEST = "JFK";

export default function TripQuickLinks({
  trips,
  rates,
  fxDate,
  offline = false,
}: {
  trips: QuickTrip[];
  rates: QuickRate[];
  /** 환율을 받은 날. 언제 값인지 안 적으면 실시간으로 오해한다 */
  fxDate: string | null;
  /**
   * 오프라인 모드. 항공권·숙소·환율은 밖에 닿아야 하는 것들이라 통째로 내린다.
   * **연휴 목록은 남는다** — 그건 이 앱이 혼자 계산하는 값이라 망과 상관이 없다.
   */
  offline?: boolean;
}) {
  const [from, setFrom] = useState(ORIGINS[0].code);
  // 가나다순 첫 도시(DESTINATIONS[0])는 그냥 정렬 결과일 뿐이라 기본값으로 삼을 이유가 없다.
  // 목록에서 사라져도 화면이 비지 않도록 없으면 첫 도시로 떨어진다.
  const [to, setTo] = useState(
    DESTINATIONS.find((d) => d.code === DEFAULT_DEST)?.code ?? DESTINATIONS[0].code,
  );
  const [adults, setAdults] = useState(1);

  const dest = findDestination(to);
  const rate = rates.find((r) => r.code === dest?.currency);
  const meta = FX_CURRENCIES.find((c) => c.code === dest?.currency);

  if (trips.length === 0) return null;

  /**
   * 나라·도시 모두 **가나다순**.
   *
   * 데이터는 '가까운 곳부터' 적혀 있지만, 예순 곳이 넘으면 그 순서를 아는 사람이 없다.
   * 목록에서 하는 일은 "아는 이름 찾기"뿐이라 이름 순이 맞다.
   */
  const byCountry = groupByCountry(DESTINATIONS);

  // 사이트 링크는 한 줄만 둔다. 줄마다 로고 여섯 개를 반복하면 목록이 다시 길어진다.
  // 대신 **어느 구간 기준인지 날짜를 같이 적어** 어디로 열리는지 헷갈리지 않게 한다.
  const linked = trips[0];

  return (
    <div className="flex flex-col gap-2.5">
      {/*
        ① 연휴 목록 — 이 칸의 **답**이다.
        한 줄에 `며칠 → 언제 → 연차 얼마` 순으로 굵기를 낮춰 가며 적는다.
        셋을 같은 크기로 늘어놓으면 무엇이 답인지 눈이 못 고르고,
        두 줄로 쪼개면 옆의 단추와 높이가 어긋나 덩어리처럼 보인다.
      */}
      <ul className="flex flex-col gap-1">
        {trips.map((trip) => {
          /**
           * 아래 링크·환율이 어느 줄 기준인지 알려 주는 표시.
           *
           * 글자로 "첫 줄 기준입니다"라고 적어 봤더니 줄만 하나 더 늘고 잘 읽히지도 않았다.
           * **선택된 것처럼 보이게** 하는 편이 짧다 — 테두리와 배경만 바꾸면
           * 아래 도구가 이 줄에 딸린 것으로 자연히 읽힌다.
           * 줄이 하나뿐이면 고를 것이 없으니 표시하지 않는다.
           */
          const linkedRow = trips.length > 1 && trip.start === linked.start;

          return (
          <li key={trip.start} className="flex items-center gap-1.5">
            <Link
              href={trip.href}
              scroll={false}
              title={`${trip.rangeLabel} · 연차 ${trip.leaveCount}일 (${trip.leaveLabel})`}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1 transition-colors hover:border-accent hover:bg-accent-soft ${
                linkedRow ? "border-accent bg-accent-soft" : "border-border"
              }`}
            >
              {/* 이 칸의 답은 "며칠 쉬나"다. 숫자만 굵게 세워 두면 눈이 거기부터 짚는다 */}
              <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-accent">
                {trip.totalDays}일
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums">
                {trip.rangeLabel}
              </span>
              {/* 치르는 값. 답보다 흐리게 두고, 좁아지면 이쪽부터 잘린다 */}
              <span className="min-w-0 truncate text-[10px] text-muted">
                연차 {trip.leaveCount}일 · {trip.leaveLabel}
              </span>
            </Link>
            <BookLeaveButton
              start={trip.start}
              end={trip.end}
              leaveDates={trip.leaveDates}
              note={trip.note}
              afterHref={trip.href}
              className="px-2 py-1"
            />
          </li>
          );
        })}
      </ul>

      {!offline && (
      <>
      {/*
        ② 여행 도구 — 답이 아니라 **딸린 것**이라 살짝 눌러 앉힌 판에 담는다.
        두 줄을 같은 격자(왼쪽 내용 / 오른쪽 정보)로 맞춰 오른쪽 끝이 세로로 정렬된다.
        칸을 나누는 테두리를 더 긋지 않고 배경색만 바꾼 이유는, 이미 바깥에 테두리가
        두 겹(칸 + 줄)이라 하나 더 그으면 상자 속 상자 속 상자가 되기 때문이다.
      */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-lg bg-background px-2.5 py-2">
        {/* 노선 */}
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="출발 공항"
            className={SELECT}
          >
            {ORIGINS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.city}
              </option>
            ))}
          </select>
          <span aria-hidden className="text-[11px] text-muted">
            →
          </span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="도착 도시"
            className={SELECT}
          >
            {/* 60곳이 넘어 평면 목록으로는 못 찾는다. 나라로 묶어 두면 눈이 먼저 나라를 짚는다 */}
            {byCountry.map(([country, cities]) => (
              <optgroup key={country} label={country}>
                {cities.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.city}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
            aria-label="인원"
            className={SELECT}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
        </div>

        {/* 비행시간·시차 — 노선을 고르면 따라오는 사실이라 같은 줄 오른쪽에.
            국내는 시차가 없고 비행시간도 말할 것이 없어 적지 않는다 */}
        <div className="justify-self-end text-[10px] leading-tight text-muted">
          {dest && !dest.domestic && (
            <>
              직항 {dest.hours}시간 <span className="opacity-50">·</span>{" "}
              {fmtDiff(dest.utcOffset)}
            </>
          )}
        </div>

        {/* 링크 — 로고만 붙여 놓으면 어디까지가 항공권인지 몰라 짧은 이름을 앞에 둔다 */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {/* 경주·전주처럼 비행기로 갈 곳이 아니면 항공권 링크를 아예 감춘다 —
              안 되는 링크를 두면 나머지 링크도 못 믿게 된다 */}
          {!dest?.noFlight && (
            <SiteGroup label="항공">
              {FLIGHT_SITES.map((site) => (
                <SiteLink
                  key={site.key}
                  href={site.url({
                    from,
                    to,
                    depart: linked.start,
                    ret: linked.end,
                    adults,
                    domestic: dest?.domestic,
                  })}
                  domain={site.logoDomain}
                  label={site.label}
                  title={`${from} → ${to} · ${linked.start} ~ ${linked.end} — ${site.label}`}
                />
              ))}
            </SiteGroup>
          )}
          <SiteGroup label="숙소">
            {STAY_SITES.map((site) => (
              <SiteLink
                key={site.key}
                href={site.url({
                  city: dest?.searchName ?? "",
                  slug: dest?.agodaSlug ?? "",
                  checkIn: linked.start,
                  checkOut: linked.end,
                  adults,
                })}
                domain={site.logoDomain}
                label={site.label}
                title={`${dest?.city} 숙소 · ${linked.start} ~ ${linked.end} — ${site.label}`}
              />
            ))}
          </SiteGroup>
        </div>

        {/* 환율 — 은행 고시처럼 '100엔 = 858원' 꼴로. '1엔 = 8.58원'이라 말하지 않는다 */}
        {/* 국내는 환율을 볼 것이 없다 ('1원 = 1원') */}
        <div className="justify-self-end">
          {dest?.domestic ? null : rate && meta ? (
            <span
              className="flex items-center gap-1 whitespace-nowrap text-[11px]"
              title={`${fxDate} 기준`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={flagUrl(meta.cc)}
                alt=""
                width={16}
                height={11}
                loading="lazy"
                className="h-2.5 w-4 shrink-0 rounded-[1px] object-cover ring-1 ring-border"
              />
              <span className="text-muted">
                {meta.unitBase.toLocaleString("ko-KR")}
                {meta.unit}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {fmtKrw(meta.unitBase / rate.perKrw)}원
              </span>
            </span>
          ) : (
            <span className="text-[10px] text-muted">환율 없음</span>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/** 로고 묶음 앞에 붙는 짧은 이름. 테두리 모양만으로는 항공권과 숙소가 구분되지 않는다 */
function SiteGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="text-[10px] text-muted">{label}</span>
      {children}
    </span>
  );
}

/** 0 -> '시차 없음', 1 -> '시차 +1시간' */
function fmtDiff(utcOffset: number): string {
  const d = utcOffset - 9;
  if (d === 0) return "시차 없음";
  return `시차 ${d > 0 ? "+" : ""}${d}시간`;
}

/**
 * 1000 이상은 정수, 그보다 작으면 소수 둘째 자리까지.
 * 1,372원은 그렇게 쓰지만 5.31원을 5원이라고 하면 값이 달라진다.
 */
function fmtKrw(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 1000
    ? Math.round(n).toLocaleString("ko-KR")
    : n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

/**
 * 로고 하나짜리 링크.
 *
 * 로고를 못 받으면(차단·오프라인) 빈 네모만 남으므로 alt에 회사 이름을 넣어 둔다 —
 * 이미지가 깨지면 브라우저가 그 글자를 대신 그려서 무엇인지는 여전히 읽힌다.
 */
function SiteLink({
  href,
  domain,
  label,
  title,
}: {
  href: string;
  domain: string;
  label: string;
  title: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface transition-colors hover:border-accent hover:bg-accent-soft"
    >
      {/* 로고를 못 받았을 때 뒤에 남는 글자. 회사 이름을 다 적으면 24px 칸을 뚫고 나와
          줄이 통째로 무너지므로 **첫 글자 하나만** 둔다 (이름은 aria-label에 있다) */}
      <span aria-hidden className="absolute text-[10px] font-semibold text-muted">
        {label.slice(0, 1)}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl(domain)}
        alt=""
        width={14}
        height={14}
        loading="lazy"
        className="relative h-3.5 w-3.5 object-contain"
      />
    </a>
  );
}

/** 나라로 묶고 나라·도시를 모두 가나다순으로 정렬한다 */
function groupByCountry(all: ReadonlyArray<Destination>): Array<[string, Destination[]]> {
  const map = new Map<string, Destination[]>();
  for (const d of all) {
    const bucket = map.get(d.country);
    if (bucket) bucket.push(d);
    else map.set(d.country, [d]);
  }

  return [...map.entries()]
    .map(([country, cities]) => {
      cities.sort((a, b) => a.city.localeCompare(b.city, "ko"));
      return [country, cities] as [string, Destination[]];
    })
    .sort(([a], [b]) => a.localeCompare(b, "ko"));
}
