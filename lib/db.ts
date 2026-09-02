import {
  createClient,
  type Client,
  type InArgs,
  type InStatement,
  type ResultSet,
} from "@libsql/client";
import path from "node:path";
import fs from "node:fs";
import { buildHolidays } from "./holidays";
import { addDays, today } from "./date";

/** 공휴일을 올해부터 몇 년치 생성해 둘지 */
const HOLIDAY_YEARS = 5;

/**
 * 공휴일 시드 판. `lib/holidays.ts`의 **규칙을 고치면 이 수를 올린다.**
 */
const HOLIDAY_SEED_VERSION = 1;

/**
 * 스키마 판. `migrate()`의 표·열·인덱스를 **고치면 이 수를 올린다.**
 *
 * 이것이 왜 필요한가: 서버리스에서는 요청마다 인스턴스가 새로 뜰 수 있어
 * `globalThis` 캐시가 먹지 않는다. 그러면 `migrate()`의 DDL 40여 개가 **매 요청마다**
 * 다시 도는데, 원격 DB에서는 그게 전부 개별 왕복이다.
 *
 * 실측(Vercel 서울 → Turso 도쿄): 이 판 검사를 넣기 전에
 *   `/api/holidays`(쿼리 2개)가 1.7초, `/`(쿼리 10여 개)가 4.4초였다.
 *   콜드 스타트가 아니라 **네 번 연속 같은 값**이었다 — 즉 구조적인 것이었다.
 *
 * 판이 같으면 DDL을 통째로 건너뛴다. 정상 상태에서 초기화 비용은 왕복 **두 번**이다
 * (meta 표 보장 + 판 읽기).
 */
const SCHEMA_VERSION = 1;

/**
 * DB 커넥션 싱글턴.
 *
 * libSQL 클라이언트를 쓴다. **같은 비동기 API로 로컬 파일과 Turso를 모두 붙인다** —
 * 주소만 다르다. 로컬·내부망은 `file:./data/app.db`, 클라우드는 `libsql://...`.
 * 예전에 쓴 Node 내장 `node:sqlite`는 동기 API여서 편했지만 로컬 파일밖에 못 본다.
 *
 * **Promise를 캐싱하는 것**이 요점이다. 객체를 캐싱하면 초기화가 끝나기 전에 들어온
 * 두 번째 요청이 마이그레이션·시드를 다시 돌린다. Promise를 캐싱하면 뒤에 온 쪽은
 * 같은 초기화를 기다린다.
 * dev 서버 HMR 때마다 모듈이 다시 평가되므로 globalThis에 둔다.
 */
const globalForDb = globalThis as unknown as { __appDb?: Promise<Client> };

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "app.db");

/** 로컬 파일을 쓰는가 (= Turso가 아닌가). PRAGMA와 체크포인트가 여기서만 의미가 있다 */
function isLocalFile(): boolean {
  return !process.env.TURSO_DATABASE_URL;
}

async function createDb(): Promise<Client> {
  const remote = process.env.TURSO_DATABASE_URL;

  let db: Client;
  if (remote) {
    db = createClient({ url: remote, authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    // 파일을 만들 자리는 우리가 챙긴다. 없는 디렉터리에는 클라이언트가 못 만든다.
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = createClient({ url: `file:${DB_PATH}` });

    // 로컬 파일에서만 의미가 있는 설정들. 원격은 서버가 알아서 한다.
    await db.execute("PRAGMA journal_mode = WAL");
    // 기본값이 0이라 다른 프로세스가 쓰고 있으면 재시도 없이 바로 SQLITE_BUSY를 던진다.
    // (dev 서버와 스크립트를 같이 돌리면 실제로 난다)
    await db.execute("PRAGMA busy_timeout = 5000");
  }

  // event_tasks의 ON DELETE CASCADE가 이것에 달려 있다
  try {
    await db.execute("PRAGMA foreign_keys = ON");
  } catch {
    // 원격에서는 서버가 정하고 이 PRAGMA를 받지 않을 수 있다. 실패해도 진행한다.
  }

  /**
   * 이미 최신이면 마이그레이션과 시드를 **건너뛴다.**
   *
   * 판 문자열에 스키마·공휴일 판과 대상 연도를 모두 넣는 이유: 어느 하나만 올려도
   * 문자열이 달라져 다시 돌게 된다. 해가 바뀌면 대상 연도가 움직이므로 새해 첫 요청에
   * 한 번 다시 돈다 — 그때 새 공휴일이 들어와야 하니 그게 맞다.
   */
  const thisYear = Number(today().slice(0, 4));
  const stamp = `schema:${SCHEMA_VERSION}|holidays:${HOLIDAY_SEED_VERSION}:${thisYear}-${thisYear + HOLIDAY_YEARS}`;

  // meta 표만 먼저 보장한다. 이것이 없으면 판을 읽을 데가 없다.
  await db.execute(
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  );
  const current = (
    await db.execute({ sql: `SELECT value FROM meta WHERE key = 'init'`, args: [] })
  ).rows[0] as unknown as { value: string } | undefined;
  if (current?.value === stamp) return db;

  await migrate(db);
  await seed(db);
  await db.execute({
    sql: `INSERT INTO meta (key, value) VALUES ('init', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [stamp],
  });

  return db;
}

export function getDb(): Promise<Client> {
  if (!globalForDb.__appDb) globalForDb.__appDb = createDb();
  return globalForDb.__appDb;
}

/* ---------------------------------------------------------------------------
 * 쿼리 헬퍼
 *
 * 예전 코드는 `db.prepare(sql).all(a, b)` 꼴이었다. libSQL은 준비된 문장을 들고 있는
 * 개념이 없고 `execute({ sql, args })` 한 방식뿐이라, 부르는 쪽이 매번 같은 껍데기를
 * 쓰게 된다. 그 껍데기를 여기 세 함수로 모아 둔다.
 *
 * 행 타입은 부르는 쪽이 제네릭으로 준다. libSQL이 돌려주는 값은
 * `string | number | bigint | ArrayBuffer | null`이라 그대로는 쓰기 어렵고,
 * 예전 코드도 `as unknown as Array<{...}>`로 캐스팅하고 있었다.
 * ------------------------------------------------------------------------ */

/** 여러 행 */
export async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const db = await getDb();
  const res = await db.execute({ sql, args });
  return res.rows as unknown as T[];
}

/** 한 행. 없으면 undefined */
export async function get<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const db = await getDb();
  const res = await db.execute({ sql, args });
  return res.rows[0] as unknown as T | undefined;
}

/**
 * 쓰기. 넣은 행의 id와 영향받은 행 수를 돌려준다.
 *
 * `lastInsertRowid`가 **bigint**로 온다. 앱 전체가 id를 number로 다루므로 여기서 바꾼다 —
 * 안 그러면 JSON으로 나갈 때 "Do not know how to serialize a BigInt"로 터진다.
 */
export async function run(
  sql: string,
  args: InArgs = [],
): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  const db = await getDb();
  const res = await db.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid === undefined ? 0 : Number(res.lastInsertRowid),
    rowsAffected: res.rowsAffected,
  };
}

/**
 * 여러 문장을 **한 번의 왕복으로** 트랜잭션에 묶어 보낸다.
 *
 * 원격 DB에서는 이것이 성능을 정한다. 공휴일 400여 행을 하나씩 await하면 왕복이 400번이다.
 */
export async function batch(statements: InStatement[]): Promise<ResultSet[]> {
  if (statements.length === 0) return [];
  const db = await getDb();
  return db.batch(statements, "write");
}

/* ------------------------------------------------------------------------ */

async function migrate(db: Client) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      end_date   TEXT    NOT NULL DEFAULT '',
      start_time TEXT,
      end_time   TEXT,
      memo       TEXT    NOT NULL DEFAULT '',
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);`);

  // 나중에 붙인 열들 (기간 일정용 end_date, 색깔용 color, 종료시각 end_time).
  // CREATE TABLE IF NOT EXISTS는 이미 있는 표를 건드리지 않으므로 여기서 따로 채운다.
  const columns = (await db.execute(`PRAGMA table_info(events)`)).rows as unknown as Array<{
    name: string;
    type: string;
  }>;
  if (!columns.some((c) => c.name === "end_date")) {
    await db.execute(`ALTER TABLE events ADD COLUMN end_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!columns.some((c) => c.name === "color")) {
    await db.execute(`ALTER TABLE events ADD COLUMN color TEXT NOT NULL DEFAULT ''`);
  }
  if (!columns.some((c) => c.name === "end_time")) {
    await db.execute(`ALTER TABLE events ADD COLUMN end_time TEXT`);
  }
  // 반복 일정은 행을 실제로 여러 개 만들고, 같은 묶음임을 이 열로만 표시한다.
  // 규칙을 저장해 조회할 때 펼치는 방식이 아니라서 달력·busyDates·수정·삭제가 전부 그대로 동작한다.
  if (!columns.some((c) => c.name === "series_id")) {
    await db.execute(`ALTER TABLE events ADD COLUMN series_id TEXT NOT NULL DEFAULT ''`);
  }
  // 이 일정이 연차인가. 며칠을 쓰는지는 아래 leave_days가 정한다.
  if (!columns.some((c) => c.name === "is_leave")) {
    await db.execute(`ALTER TABLE events ADD COLUMN is_leave INTEGER NOT NULL DEFAULT 0`);
  }
  /**
   * 이 일정으로 실제로 낸 연차 일수.
   *
   * **NULL이면 '자동'** — 기간에서 주말과 공휴일을 뺀 날수를 읽을 때 계산한다.
   * 저장해 두지 않는 이유는 일정을 옮기면 그 수가 달라지기 때문이다. 저장하면
   * 날짜만 미뤘을 때 옛날 숫자가 그대로 남는다.
   * 반차(0.5)·반반차(0.25)처럼 자동값과 다르게 낼 때만 숫자를 넣는다. 그래서 REAL이다.
   */
  const leaveCol = columns.find((c) => c.name === "leave_days");
  if (!leaveCol) {
    await db.execute(`ALTER TABLE events ADD COLUMN leave_days REAL`);
  } else if (leaveCol.type.toUpperCase() !== "REAL") {
    // 처음엔 INTEGER NOT NULL로 만들었다. 자동(NULL)을 표현하려고 REAL nullable로 바꾼다.
    // SQLite는 열 타입을 직접 못 고치므로 새 열에 옮기고 이름을 바꿔치기한다.
    await db.execute(`ALTER TABLE events ADD COLUMN leave_days_real REAL`);
    // 0은 '연차 아님'이었으니 자동(NULL)이 아니라 그냥 값이 없는 것이다
    await db.execute(`UPDATE events SET leave_days_real = NULLIF(leave_days, 0)`);
    // 그때 0보다 컸던 행은 실제로 연차였다. 그 사실을 새 열로 옮겨 준다.
    await db.execute(`UPDATE events SET is_leave = 1 WHERE leave_days > 0`);
    await db.execute(`ALTER TABLE events DROP COLUMN leave_days`);
    await db.execute(`ALTER TABLE events RENAME COLUMN leave_days_real TO leave_days`);
  }
  // 어느 휴가를 썼는지. NULL이면 기본 휴가(정렬 첫 번째 = 연차)로 본다.
  if (!columns.some((c) => c.name === "leave_type_id")) {
    await db.execute(`ALTER TABLE events ADD COLUMN leave_type_id INTEGER`);
  }
  // 구글 캘린더에서 받아 온 일정의 원본 id. 빈 값이면 **사람이 이 앱에서 만든 것**이다.
  // 다시 받아 올 때 같은 일정을 두 번 넣지 않으려면 원본 쪽 id를 들고 있어야 한다.
  if (!columns.some((c) => c.name === "google_id")) {
    await db.execute(`ALTER TABLE events ADD COLUMN google_id TEXT NOT NULL DEFAULT ''`);
  }
  // 부분 인덱스라 빈 값(사람이 만든 일정)끼리는 충돌하지 않는다
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_google_id
           ON events(google_id) WHERE google_id != ''`);
  // 한 번의 가져오기로 들어온 일정에 같은 번호를 달아 둔다. 통째로 되돌리기 위한 것이다.
  // NULL이면 사람이 직접 만들었거나 구글에서 온 것이다.
  if (!columns.some((c) => c.name === "import_batch_id")) {
    await db.execute(`ALTER TABLE events ADD COLUMN import_batch_id INTEGER`);
  }
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_import_batch
           ON events(import_batch_id) WHERE import_batch_id IS NOT NULL`);

  // 하루짜리 일정은 end_date를 시작일과 같게 둔다. 그래야 'date <= d <= end_date' 한 조건으로 끝난다.
  await db.execute(`UPDATE events SET end_date = date WHERE end_date = '' OR end_date IS NULL`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_events_end_date ON events(end_date);`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS holidays (
      date TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL
    );
  `);

  /**
   * 앱이 스스로에 대해 적어 두는 것. 지금은 공휴일 시드 판 하나뿐이다.
   *
   * `app_settings`와 나누는 이유: 저건 **사용자의** 설정이고 이건 **앱의** 상태다.
   * 나중에 사용자별로 갈라야 하는 것은 앞쪽뿐이라, 섞어 두면 그때 갈라내기 어렵다.
   */
  await db.execute(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 기간 일정에 딸린 준비물·할 일. 여행 일정을 넣으면 예약·짐이 따라오는데
  // 그것까지 일정으로 만들면 달력이 잡일로 덮인다.
  // ON DELETE CASCADE로 일정을 지우면 같이 사라진다 (PRAGMA foreign_keys = ON 필요).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      text       TEXT    NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_event_tasks_event ON event_tasks(event_id);`);

  // 연차 잔고. 해마다 총 며칠인지는 회사·근속마다 달라 규칙으로 만들 수 없어 사용자가 넣는다.
  // 쓴 일수는 여기 저장하지 않는다 — events.leave_days를 합산하면 나오는 값이라
  // 따로 두면 일정을 지웠을 때 어긋난다.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS leave_budget (
      year       INTEGER PRIMARY KEY,
      total_days REAL    NOT NULL
    );
  `);

  /**
   * 휴가 종류.
   *
   * 회사마다 **주기가 다른 휴가가 여러 개** 돈다. 연차는 입사일 기준으로 1년씩 굴러가고,
   * 특별휴가는 달력해로 끊겨 연말에 소멸하고 새해에 다시 채워지는 식이다.
   * 그래서 "연도"가 아니라 **주기(period)** 로 세야 한다 — 이 표가 그 주기를 정의한다.
   *
   * - cycle 'calendar'    : 1/1 ~ 12/31
   * - cycle 'anniversary' : anchor_date(입사일)의 월·일부터 1년
   * - min_unit            : 쪼갤 수 있는 최소 단위. 연차는 0.25(반반차), 특별휴가는 1(하루)
   * - carry_over          : 남은 것이 다음 주기로 넘어가는지. 0이면 소멸
   */
  await db.execute(`
    CREATE TABLE IF NOT EXISTS leave_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      cycle       TEXT    NOT NULL,
      anchor_date TEXT,
      min_unit    REAL    NOT NULL DEFAULT 0.25,
      carry_over  INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
  `);

  /**
   * 주기별 지급 일수.
   *
   * 연도가 아니라 **주기 시작일**을 키로 잡는다. 입사일이 3/15면 주기가 3/15에 시작하므로
   * '2026년 연차'라는 말 자체가 성립하지 않는다.
   * 근속연수에 따라 일수가 달라지므로 주기마다 따로 적는다 (사람이 넣는다).
   */
  await db.execute(`
    CREATE TABLE IF NOT EXISTS leave_grants (
      type_id      INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
      period_start TEXT    NOT NULL,
      total_days   REAL    NOT NULL,
      PRIMARY KEY (type_id, period_start)
    );
  `);

  await seedLeaveTypes(db);

  // 환율 캐시. 원(KRW) 1에 대한 상대 통화의 값을 날짜별로 쌓는다.
  // 매 요청마다 외부 API를 부르면 화면이 남의 서버 사정에 묶이므로 하루치를 받아 두고 쓴다.
  // 지난 날짜 행도 지우지 않는다 — API가 죽었을 때 마지막으로 받은 값이라도 보여 주기 위해서다.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS fx_rates (
      date  TEXT NOT NULL,
      quote TEXT NOT NULL,
      rate  REAL NOT NULL,
      PRIMARY KEY (date, quote)
    );
  `);

  // 가져오기 이력. **되돌리기 하나 때문에 있는 표다** — 파일을 넣은 뒤 "아니다" 싶을 때
  // 한 건씩 지우게 하면 스무 건짜리도 손이 못 간다.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      label      TEXT NOT NULL DEFAULT '',
      added      INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 앱 설정 한 줌. 키-값 한 표로 두는 이유: 설정마다 열을 늘리면 항목이 하나 늘 때마다
  // 마이그레이션이 붙는데, 여기 들어올 것은 켜고 끄는 스위치 몇 개뿐이다.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 구글 캘린더 연결. **행이 하나뿐이다**(CHECK id = 1) — 혼자 쓰는 로컬 앱이라
  // 계정을 여러 개 붙일 일이 없고, 하나로 못박아 두면 '어느 계정이더라'를 물을 일도 없다.
  //
  // refresh_token은 사실상 비밀번호다. 이 표는 DB 안에 있고 로컬 파일은 gitignore되지만,
  // **백업(.ics)에는 절대 싣지 않는다** — 백업은 남에게 건네는 물건이다.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS google_auth (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      access_token   TEXT NOT NULL,
      refresh_token  TEXT NOT NULL,
      expires_at     TEXT NOT NULL,
      email          TEXT NOT NULL DEFAULT '',
      calendar_id    TEXT NOT NULL DEFAULT 'primary',
      calendar_name  TEXT NOT NULL DEFAULT '',
      last_synced_at TEXT,
      connected_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * 휴가 종류 기본값과, 예전 `leave_budget`(연도별 한 종류)에서의 이관.
 *
 * 한 번만 돈다 — 이미 종류가 있으면 사용자가 고쳐 놓았을 수 있어 건드리지 않는다.
 * 입사일(anchor_date)은 사람마다 달라 비워 두고 화면에서 받는다. 비어 있는 동안에는
 * 달력해로 굴러가므로, 안 넣어도 앱이 멈추지는 않는다.
 */
async function seedLeaveTypes(db: Client) {
  const countRow = (await db.execute(`SELECT COUNT(*) AS n FROM leave_types`)).rows[0] as unknown as {
    n: number;
  };
  if (Number(countRow.n) > 0) return;

  await db.batch(
    [
      // 연차: 입사일 기준 · 반반차까지 · 소멸
      {
        sql: `INSERT INTO leave_types (name, cycle, anchor_date, min_unit, carry_over, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["연차", "anniversary", null, 0.25, 0, 0],
      },
      // 특별휴가: 달력해 · 하루 단위만 · 연말 소멸
      {
        sql: `INSERT INTO leave_types (name, cycle, anchor_date, min_unit, carry_over, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["특별휴가", "calendar", null, 1, 0, 1],
      },
    ],
    "write",
  );

  const annual = (await db.execute(`SELECT id FROM leave_types WHERE sort_order = 0`))
    .rows[0] as unknown as { id: number } | undefined;
  if (!annual) return;
  const annualId = Number(annual.id);

  // 예전에 넣어 둔 연도별 총 연차를 그대로 옮긴다. 잃는 것 없이 새 구조로 넘어간다.
  const old = (await db.execute(`SELECT year, total_days FROM leave_budget`))
    .rows as unknown as Array<{ year: number; total_days: number }>;

  await db.batch(
    [
      ...old.map((row) => ({
        sql: `INSERT OR IGNORE INTO leave_grants (type_id, period_start, total_days) VALUES (?, ?, ?)`,
        args: [annualId, `${row.year}-01-01`, row.total_days] as InArgs,
      })),
      // 기존 연차 일정에도 종류를 달아 준다
      {
        sql: `UPDATE events SET leave_type_id = ? WHERE is_leave = 1 AND leave_type_id IS NULL`,
        args: [annualId] as InArgs,
      },
    ],
    "write",
  );
}

async function seed(db: Client) {
  await seedHolidays(db);

  // 일정: 비어 있을 때만 넣는다. 빈 화면으로 시작하지 않게 하는 용도.
  const countRow = (await db.execute(`SELECT COUNT(*) AS n FROM events`)).rows[0] as unknown as {
    n: number;
  };
  if (Number(countRow.n) > 0) return;

  const t = today();
  const sql = `INSERT INTO events (title, date, end_date, start_time, end_time, memo, done, color)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  // [제목, 시작일, 종료일, 시작시각, 종료시각, 메모, 완료, 색]
  const rows: Array<[string, string, string, string | null, string | null, string, number, string]> = [
    ["팀 데일리 스크럼", t, t, "09:30", "09:45", "어제 한 일 / 오늘 할 일 공유", 1, "gray"],
    ["Next.js + SQLite 과제 만들기", t, t, "14:00", "18:00", "Day 2: CLAUDE.md 초안과 첫 화면", 0, "blue"],
    ["장보기", t, t, null, null, "우유, 계란, 커피 원두", 0, "green"],
    ["치과 예약", addDays(t, 1), addDays(t, 1), "11:00", "12:00", "스케일링", 0, "red"],
    ["코드 리뷰 마감", addDays(t, 2), addDays(t, 2), "18:00", null, "", 0, "red"],
    ["워크숍 출장", addDays(t, 3), addDays(t, 5), null, null, "1박 2일 아니고 2박 3일", 0, "purple"],
    ["부모님 생신", addDays(t, 5), addDays(t, 5), null, null, "선물 미리 준비", 0, "amber"],
    ["분기 회고 문서 작성", addDays(t, 9), addDays(t, 9), "15:00", "16:30", "", 0, "blue"],
    ["도서관 책 반납", addDays(t, -2), addDays(t, -2), null, null, "연체 중", 1, ""],
  ];

  await db.batch(
    rows.map((r) => ({ sql, args: r as InArgs })),
    "write",
  );
}

/**
 * 공휴일은 `lib/holidays.ts`가 규칙으로 만들어 낸다.
 *
 * 규칙을 고쳤을 때 예전에 잘못 들어간 행이 남지 않도록 **통째로 갈아 끼운다.**
 * 여기까지 왔다는 것은 `createDb()`의 판 검사가 이미 "다시 돌아야 한다"고 판정한
 * 것이므로, 이 함수는 판을 다시 보지 않는다. 지우기와 넣기를 `batch`로 묶어
 * 왕복 한 번에 끝낸다 (120행을 하나씩 await하면 왕복이 120번이다).
 *
 * ⚠️ `holidays.ts`의 규칙을 고치면 `HOLIDAY_SEED_VERSION`을 올릴 것. 안 올리면
 *    이미 시드된 DB에는 새 규칙이 반영되지 않는다 (로컬은 `data/`를 지워도 된다).
 */
async function seedHolidays(db: Client) {
  const thisYear = Number(today().slice(0, 4));
  const holidays = buildHolidays(thisYear, thisYear + HOLIDAY_YEARS);
  await db.batch(
    [
      { sql: `DELETE FROM holidays`, args: [] as InArgs },
      ...holidays.map((h) => ({
        sql: `INSERT INTO holidays (date, name, kind) VALUES (?, ?, ?)`,
        args: [h.date, h.name, h.kind] as InArgs,
      })),
    ],
    "write",
  );
}

/**
 * WAL을 본체 파일로 밀어 넣는다. **로컬 파일일 때만 의미가 있다.**
 *
 * WAL 모드에서는 최근 쓰기가 `app.db-wal`에만 있다. 서버가 뜬 채로 `app.db` 하나만
 * 복사하면(파일 동기화 도구가 흔히 하는 일) **그 사이 넣은 일정이 통째로 빠진 DB**를 얻는다.
 * 실제로 본체 60KB에 WAL이 4MB까지 자란 것을 확인했다.
 *
 * 백업을 내보내기 직전에 부른다 — 그때가 "지금까지의 데이터"를 확정해야 하는 순간이다.
 * Turso를 쓰면 파일이 우리 손에 없으므로 할 일이 없다.
 */
export async function checkpoint(): Promise<void> {
  if (!isLocalFile()) return;
  try {
    const db = await getDb();
    await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // 체크포인트는 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
    // 다른 커넥션이 읽는 중이면 실패할 수 있는데, 그때도 백업 자체는 나가야 한다.
  }
}
