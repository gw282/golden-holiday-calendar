import { all, get, run, batch } from "./db";
import { addDays, isValidDateStr, today, type DateStr } from "./date";
import { createEvent, ValidationError } from "./events";

/**
 * 구글 캘린더 연동 (OAuth 2.0 + Calendar API v3).
 *
 * `.ics` 비공개 주소를 붙여 넣는 방법도 있었지만 OAuth를 골랐다. 결정적인 이유는
 * **반복 일정**이다 — `.ics`에는 `RRULE`(규칙)만 들어 있어 우리가 직접 펼쳐야 하는데,
 * `EXDATE`(취소된 회차)와 `RECURRENCE-ID`(한 회차만 옮긴 것)까지 맞추지 않으면
 * 있지도 않은 회의가 달력에 찍힌다. API는 `singleEvents=true` 하나로 **구글이 펼쳐서** 준다.
 * 규칙 해석은 그 규칙을 만든 쪽에 맡기는 것이 옳다.
 *
 * SDK(`googleapis`)를 쓰지 않고 fetch로 직접 부른다. 쓰는 엔드포인트가 넷뿐이라
 * 수십 MB짜리 의존성을 들일 이유가 없다.
 *
 * **토큰은 DB에만 둔다.** `google_auth` 표는 행이 하나뿐이고 백업(.ics)에는 싣지 않는다.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

/**
 * **읽기 권한만 받는다.** 지금 부르는 것은 `events.list`와 `calendarList.list` 둘뿐이라
 * 쓰기 권한은 쓰이지 않는다.
 *
 * 한때 나중을 대비해 `calendar.events`(읽기·쓰기)까지 받아 두었는데 그만뒀다. 이유 둘:
 * 안 쓰는 권한이 동의 화면에 뜨면 사용자는 "얘가 내 일정을 고칠 수 있다"고 읽고,
 * 구글 앱 확인 심사에서도 **쓰지 않는 권한은 그 자체가 지적 사항**이 된다.
 * 나중에 연차를 구글로 올리는 기능을 붙일 때 다시 넣고 동의를 한 번 더 받으면 된다.
 *
 * `openid`·`email`은 민감한 범위가 아니다. 화면에 계정 이름을 적는 데만 쓴다.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
].join(" ");

/** 받아 올 구간 — 지난 달부터 1년 남짓. 캘린더 전체를 긁으면 몇 천 건이 들어온다 */
const WINDOW_BACK_DAYS = 30;
const WINDOW_FWD_DAYS = 400;
/** 페이지를 도는 횟수 상한. 무한 루프로 구글을 두드리는 사고를 막는다 */
const MAX_PAGES = 12;

export type GoogleConnection = {
  connected: boolean;
  /** `.env.local`이 채워져 있는가. false면 연결 단추를 눌러도 소용이 없다 */
  configured: boolean;
  email: string;
  calendarId: string;
  calendarName: string;
  lastSyncedAt: string | null;
};

type AuthRow = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  email: string;
  calendar_id: string;
  calendar_name: string;
  last_synced_at: string | null;
};

export class GoogleError extends Error {}

// ── 설정 ─────────────────────────────────────────────────

export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * 리디렉션 주소. 구글 클라우드 콘솔에 **글자 하나까지 똑같이** 등록해 두어야 한다.
 * 요청 origin에서 만들지 않고 고정값을 쓰는 이유: 콘솔에 등록한 것과 한 글자라도
 * 어긋나면 `redirect_uri_mismatch`가 나는데 그때 원인을 찾기가 대단히 어렵다.
 */
export function redirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/google/callback";
}

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new GoogleError("GOOGLE_CLIENT_ID가 없습니다. .env.local을 확인해 주세요.");
  return v;
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new GoogleError("GOOGLE_CLIENT_SECRET이 없습니다. .env.local을 확인해 주세요.");
  return v;
}

// ── 동의 화면 ────────────────────────────────────────────

export function authUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    state,
    // refresh_token은 **처음 동의할 때 한 번만** 준다. 이 둘이 없으면 이미 동의한
    // 계정을 다시 연결할 때 access_token만 와서 한 시간 뒤 조용히 끊긴다.
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${q}`;
}

// ── 토큰 ─────────────────────────────────────────────────

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error) {
    throw new GoogleError(data.error_description ?? data.error ?? `구글 응답 ${res.status}`);
  }
  return data;
}

/** `expires_in`(초) → 만료 시각 ISO. 60초 앞당겨 두어 경계에서 401이 나지 않게 한다 */
function expiryFrom(expiresIn: number | undefined): string {
  const ms = (expiresIn ?? 3600) * 1000 - 60_000;
  return new Date(Date.now() + ms).toISOString();
}

/**
 * `id_token`(JWT) 가운데 조각에서 이메일만 꺼낸다. **서명은 검증하지 않는다** —
 * 방금 구글과 TLS로 직접 주고받은 값이라 중간에 낄 자리가 없고,
 * 쓰임새가 화면에 계정 이름을 적는 것뿐이라 권한 판단에 쓰이지 않는다.
 */
function emailFromIdToken(idToken: string | undefined): string {
  if (!idToken) return "";
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return "";
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
    const parsed = JSON.parse(json) as { email?: string };
    return typeof parsed.email === "string" ? parsed.email : "";
  } catch {
    return "";
  }
}

export async function exchangeCode(code: string): Promise<void> {
  const data = await postToken({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });

  if (!data.access_token) throw new GoogleError("액세스 토큰을 받지 못했습니다.");
  if (!data.refresh_token) {
    // prompt=consent를 붙였는데도 없다면 계정 쪽에서 이미 발급된 것을 재사용 중이다.
    // 그대로 저장하면 한 시간 뒤 조용히 끊기므로 여기서 막고 길을 알려 준다.
    throw new GoogleError(
      "갱신 토큰을 받지 못했습니다. 구글 계정 > 보안 > 서드파티 앱에서 이 앱의 액세스를 지운 뒤 다시 연결해 주세요.",
    );
  }

  await run(
    `INSERT INTO google_auth (id, access_token, refresh_token, expires_at, email, calendar_id, calendar_name)
     VALUES (1, ?, ?, ?, ?, 'primary', '')
     ON CONFLICT(id) DO UPDATE SET
       access_token  = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at    = excluded.expires_at,
       email         = excluded.email`,
    [
      data.access_token,
      data.refresh_token,
      expiryFrom(data.expires_in),
      emailFromIdToken(data.id_token),
    ],
  );
}

async function authRow(): Promise<AuthRow | null> {
  const row = await get<AuthRow>(`SELECT * FROM google_auth WHERE id = 1`);
  return row ?? null;
}

/** 필요하면 갱신해서, 바로 쓸 수 있는 액세스 토큰을 준다 */
async function accessToken(): Promise<string> {
  const row = await authRow();
  if (!row) throw new GoogleError("구글 캘린더가 연결되어 있지 않습니다.");
  if (new Date(row.expires_at).getTime() > Date.now()) return row.access_token;

  const data = await postToken({
    refresh_token: row.refresh_token,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  });
  if (!data.access_token) throw new GoogleError("토큰을 갱신하지 못했습니다.");

  await run(`UPDATE google_auth SET access_token = ?, expires_at = ? WHERE id = 1`, [
    data.access_token,
    expiryFrom(data.expires_in),
  ]);
  return data.access_token;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleError(body.error?.message ?? `구글 응답 ${res.status}`);
  }
  return (await res.json()) as T;
}

// ── 상태 · 해제 ──────────────────────────────────────────

export async function connection(): Promise<GoogleConnection> {
  const row = await authRow();
  return {
    connected: Boolean(row),
    configured: isConfigured(),
    email: row?.email ?? "",
    calendarId: row?.calendar_id ?? "primary",
    calendarName: row?.calendar_name ?? "",
    lastSyncedAt: row?.last_synced_at ?? null,
  };
}

/**
 * 연결 해제. 구글 쪽 동의까지 취소하고 토큰을 지운다.
 *
 * **받아 온 일정도 같이 지운다.** 남겨 두면 구글에서 지운 일정이 이쪽에만 영원히
 * 남는데, 주인이 없어져 다시는 갱신되지 않는 유령이 된다.
 */
export async function disconnect(): Promise<number> {
  const row = await authRow();
  if (row) {
    // 취소가 실패해도(이미 만료 등) 이쪽 정리는 진행한다.
    // 구글에 못 알린다고 해제 자체가 막히면 사용자는 빠져나갈 길이 없다.
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: row.refresh_token }),
    }).catch(() => undefined);
  }
  const { rowsAffected } = await run(`DELETE FROM events WHERE google_id != ''`);
  await run(`DELETE FROM google_auth WHERE id = 1`);
  return rowsAffected;
}

// ── 캘린더 목록 ──────────────────────────────────────────

export type CalendarChoice = { id: string; name: string; primary: boolean };

export async function listCalendars(): Promise<CalendarChoice[]> {
  const data = await api<{
    items?: Array<{ id: string; summary?: string; primary?: boolean }>;
  }>("/users/me/calendarList?minAccessRole=reader&maxResults=100");

  return (data.items ?? []).map((c) => ({
    id: c.id,
    name: c.summary ?? c.id,
    primary: Boolean(c.primary),
  }));
}

export async function chooseCalendar(id: string, name: string): Promise<void> {
  // 캘린더를 바꾸면 이전 캘린더에서 받아 온 것은 남길 이유가 없다.
  // 지우기와 바꾸기를 한 트랜잭션으로 묶는다 — 중간에 끊기면 "캘린더는 그대로인데
  // 받아 온 일정만 사라진" 상태가 남는다.
  await batch([
    { sql: `DELETE FROM events WHERE google_id != ''`, args: [] },
    {
      sql: `UPDATE google_auth SET calendar_id = ?, calendar_name = ?, last_synced_at = NULL WHERE id = 1`,
      args: [id, name],
    },
  ]);
}

// ── 동기화 ───────────────────────────────────────────────

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export type SyncResult = { added: number; updated: number; removed: number; total: number };

/**
 * 구글 → 이 앱. **한 방향이다.**
 *
 * 받아 온 일정에는 `google_id`가 붙고, 다음 동기화 때 구글 쪽 내용으로 덮인다.
 * 즉 그 일정의 주인은 구글이다. 양쪽에서 고칠 수 있게 하면 충돌할 때마다
 * 어느 쪽이 이기는지를 물어야 하는데, 그건 이 앱이 감당할 복잡도가 아니다.
 */
export async function syncEvents(): Promise<SyncResult> {
  const row = await authRow();
  if (!row) throw new GoogleError("구글 캘린더가 연결되어 있지 않습니다.");

  const from = addDays(today(), -WINDOW_BACK_DAYS);
  const to = addDays(today(), WINDOW_FWD_DAYS);

  const items: GEvent[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const q = new URLSearchParams({
      // 구글이 반복 규칙을 펼쳐 회차별로 준다. 우리가 RRULE을 해석하지 않는 이유가 이것이다
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: `${from}T00:00:00Z`,
      timeMax: `${to}T00:00:00Z`,
      // 응답의 시각을 한국 시간으로 맞춘다. 그래야 문자열 앞 10글자를 그대로 날짜로
      // 쓸 수 있다 — 이 앱은 Date 객체를 DB·API 경계 너머로 넘기지 않는다
      timeZone: "Asia/Seoul",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) q.set("pageToken", pageToken);

    const data = await api<{ items?: GEvent[]; nextPageToken?: string }>(
      `/calendars/${encodeURIComponent(row.calendar_id)}/events?${q}`,
    );
    items.push(...(data.items ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  const existing = await all<{
    id: number;
    google_id: string;
    date: DateStr;
    end_date: DateStr;
  }>(`SELECT id, google_id, date, end_date FROM events WHERE google_id != ''`);
  const byGoogleId = new Map(existing.map((e) => [e.google_id, e.id]));

  const updateSql = `UPDATE events SET title = ?, date = ?, end_date = ?, start_time = ?, end_time = ?, memo = ?
     WHERE id = ?`;
  // 고칠 것을 모아 뒀다가 한 번에 보낸다. 동기화는 수백 건이 오는 일이 있어서,
  // 건마다 왕복하면 원격 DB에서 이 함수만 몇 분이 된다.
  const updates: Array<{ sql: string; args: Array<string | number | null> }> = [];

  let added = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const item of items) {
    if (item.status === "cancelled") continue;
    const parsed = toInput(item);
    if (!parsed) continue;
    seen.add(item.id);

    const existingId = byGoogleId.get(item.id);
    if (existingId !== undefined) {
      updates.push({
        sql: updateSql,
        args: [
          parsed.title,
          parsed.date,
          parsed.endDate,
          parsed.startTime,
          parsed.endTime,
          parsed.memo,
          existingId,
        ],
      });
      updated += 1;
      continue;
    }
    try {
      await createEvent({ ...parsed, googleId: item.id });
      added += 1;
    } catch (e) {
      // 한 건이 틀렸다고 나머지를 버리지 않는다
      if (!(e instanceof ValidationError)) throw e;
    }
  }

  // 구글에서 지워진 일정은 이쪽에서도 지운다 — **받아 온 구간 안에 있는 것만.**
  // 구간 밖(작년 일정 등)까지 지우면 창을 옮길 때마다 멀쩡한 기록이 사라진다.
  const removals: Array<{ sql: string; args: Array<string | number | null> }> = [];
  for (const e of existing) {
    if (seen.has(e.google_id)) continue;
    if (e.end_date < from || e.date > to) continue;
    removals.push({ sql: `DELETE FROM events WHERE id = ?`, args: [e.id] });
  }
  const removed = removals.length;

  await batch([
    ...updates,
    ...removals,
    {
      sql: `UPDATE google_auth SET last_synced_at = datetime('now') WHERE id = 1`,
      args: [],
    },
  ]);
  return { added, updated, removed, total: seen.size };
}

/**
 * 구글 이벤트 → 이 앱의 입력.
 *
 * 하루 종일 일정의 `end.date`는 **열린 구간**이라 하루를 뺀다 (9/1 하루짜리의 end는 9/2).
 * 시각이 있는 일정은 `2026-09-02T14:00:00+09:00` 꼴이라 문자열을 잘라 쓴다 —
 * 위에서 `timeZone=Asia/Seoul`로 받았기 때문에 이 자르기가 안전하다.
 */
function toInput(g: GEvent): {
  title: string;
  date: DateStr;
  endDate: DateStr;
  startTime: string | null;
  endTime: string | null;
  memo: string;
} | null {
  const startRaw = g.start?.date ?? g.start?.dateTime;
  if (!startRaw) return null;

  const allDay = Boolean(g.start?.date);
  const date = startRaw.slice(0, 10);
  if (!isValidDateStr(date)) return null;

  let endDate: DateStr = date;
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (allDay) {
    const rawEnd = g.end?.date?.slice(0, 10);
    if (rawEnd && isValidDateStr(rawEnd)) endDate = addDays(rawEnd, -1);
  } else {
    startTime = startRaw.slice(11, 16);
    const rawEnd = g.end?.dateTime;
    if (rawEnd) {
      const d = rawEnd.slice(0, 10);
      if (isValidDateStr(d)) endDate = d;
      endTime = rawEnd.slice(11, 16);
    }
  }
  // 뺀 결과가 시작일보다 앞서면 하루짜리로 본다
  if (endDate < date) endDate = date;
  // 자정에 끝나는 일정은 종료일이 다음 날로 잡혀 이틀짜리로 보인다.
  // 23시~24시 회의가 달력에서 이틀을 가로지르는 것을 막는다.
  if (!allDay && endTime === "00:00" && endDate > date) {
    endDate = addDays(endDate, -1);
    endTime = null;
  }

  return {
    title: (g.summary ?? "").trim() || "제목 없음",
    date,
    endDate,
    startTime,
    endTime,
    // 회의 초대장 본문은 수십 줄짜리 화상회의 안내가 붙는다. 목록 미리보기에 쓸 만큼만 남긴다
    memo: (g.description ?? "").trim().slice(0, 500),
  };
}
