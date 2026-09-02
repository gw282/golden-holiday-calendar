import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { buildHolidays } from "./holidays";
import { addDays, today } from "./date";

/** 공휴일을 올해부터 몇 년치 생성해 둘지 */
const HOLIDAY_YEARS = 5;

/**
 * SQLite 커넥션 싱글턴.
 *
 * Node 24 내장 `node:sqlite`를 쓴다 (better-sqlite3와 달리 네이티브 빌드가 필요 없음).
 * dev 서버 HMR 때마다 모듈이 다시 평가되므로 globalThis에 캐싱해 커넥션 중복 생성을 막는다.
 */
const globalForDb = globalThis as unknown as { __appDb?: DatabaseSync };

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "app.db");

function createDb(): DatabaseSync {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // 기본값이 0이라 다른 프로세스가 쓰고 있으면 재시도 없이 바로 SQLITE_BUSY를 던진다.
  // (dev 서버와 스크립트를 같이 돌리면 실제로 난다)
  db.exec("PRAGMA busy_timeout = 5000");

  migrate(db);
  seed(db);

  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);`);

  // 나중에 붙인 열들 (기간 일정용 end_date, 색깔용 color, 종료시각 end_time).
  // CREATE TABLE IF NOT EXISTS는 이미 있는 표를 건드리지 않으므로 여기서 따로 채운다.
  const columns = db.prepare(`PRAGMA table_info(events)`).all() as unknown as Array<{
    name: string;
    type: string;
  }>;
  if (!columns.some((c) => c.name === "end_date")) {
    db.exec(`ALTER TABLE events ADD COLUMN end_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!columns.some((c) => c.name === "color")) {
    db.exec(`ALTER TABLE events ADD COLUMN color TEXT NOT NULL DEFAULT ''`);
  }
  if (!columns.some((c) => c.name === "end_time")) {
    db.exec(`ALTER TABLE events ADD COLUMN end_time TEXT`);
  }
  // 반복 일정은 행을 실제로 여러 개 만들고, 같은 묶음임을 이 열로만 표시한다.
  // 규칙을 저장해 조회할 때 펼치는 방식이 아니라서 달력·busyDates·수정·삭제가 전부 그대로 동작한다.
  if (!columns.some((c) => c.name === "series_id")) {
    db.exec(`ALTER TABLE events ADD COLUMN series_id TEXT NOT NULL DEFAULT ''`);
  }
  // 이 일정이 연차인가. 며칠을 쓰는지는 아래 leave_days가 정한다.
  if (!columns.some((c) => c.name === "is_leave")) {
    db.exec(`ALTER TABLE events ADD COLUMN is_leave INTEGER NOT NULL DEFAULT 0`);
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
    db.exec(`ALTER TABLE events ADD COLUMN leave_days REAL`);
  } else if (leaveCol.type.toUpperCase() !== "REAL") {
    // 처음엔 INTEGER NOT NULL로 만들었다. 자동(NULL)을 표현하려고 REAL nullable로 바꾼다.
    // SQLite는 열 타입을 직접 못 고치므로 새 열에 옮기고 이름을 바꿔치기한다.
    db.exec(`ALTER TABLE events ADD COLUMN leave_days_real REAL`);
    // 0은 '연차 아님'이었으니 자동(NULL)이 아니라 그냥 값이 없는 것이다
    db.exec(`UPDATE events SET leave_days_real = NULLIF(leave_days, 0)`);
    // 그때 0보다 컸던 행은 실제로 연차였다. 그 사실을 새 열로 옮겨 준다.
    db.exec(`UPDATE events SET is_leave = 1 WHERE leave_days > 0`);
    db.exec(`ALTER TABLE events DROP COLUMN leave_days`);
    db.exec(`ALTER TABLE events RENAME COLUMN leave_days_real TO leave_days`);
  }
  // 어느 휴가를 썼는지. NULL이면 기본 휴가(정렬 첫 번째 = 연차)로 본다.
  if (!columns.some((c) => c.name === "leave_type_id")) {
    db.exec(`ALTER TABLE events ADD COLUMN leave_type_id INTEGER`);
  }
  // 구글 캘린더에서 받아 온 일정의 원본 id. 빈 값이면 **사람이 이 앱에서 만든 것**이다.
  // 다시 받아 올 때 같은 일정을 두 번 넣지 않으려면 원본 쪽 id를 들고 있어야 한다.
  if (!columns.some((c) => c.name === "google_id")) {
    db.exec(`ALTER TABLE events ADD COLUMN google_id TEXT NOT NULL DEFAULT ''`);
  }
  // 부분 인덱스라 빈 값(사람이 만든 일정)끼리는 충돌하지 않는다
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_google_id
           ON events(google_id) WHERE google_id != ''`);
  // 한 번의 가져오기로 들어온 일정에 같은 번호를 달아 둔다. 통째로 되돌리기 위한 것이다.
  // NULL이면 사람이 직접 만들었거나 구글에서 온 것이다.
  if (!columns.some((c) => c.name === "import_batch_id")) {
    db.exec(`ALTER TABLE events ADD COLUMN import_batch_id INTEGER`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_import_batch
           ON events(import_batch_id) WHERE import_batch_id IS NOT NULL`);

  // 하루짜리 일정은 end_date를 시작일과 같게 둔다. 그래야 'date <= d <= end_date' 한 조건으로 끝난다.
  db.exec(`UPDATE events SET end_date = date WHERE end_date = '' OR end_date IS NULL`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_end_date ON events(end_date);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      date TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL
    );
  `);

  // 기간 일정에 딸린 준비물·할 일. 여행 일정을 넣으면 예약·짐이 따라오는데
  // 그것까지 일정으로 만들면 달력이 잡일로 덮인다.
  // ON DELETE CASCADE로 일정을 지우면 같이 사라진다 (PRAGMA foreign_keys = ON 필요).
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      text       TEXT    NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_tasks_event ON event_tasks(event_id);`);

  // 연차 잔고. 해마다 총 며칠인지는 회사·근속마다 달라 규칙으로 만들 수 없어 사용자가 넣는다.
  // 쓴 일수는 여기 저장하지 않는다 — events.leave_days를 합산하면 나오는 값이라
  // 따로 두면 일정을 지웠을 때 어긋난다.
  db.exec(`
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
  db.exec(`
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_grants (
      type_id      INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
      period_start TEXT    NOT NULL,
      total_days   REAL    NOT NULL,
      PRIMARY KEY (type_id, period_start)
    );
  `);

  seedLeaveTypes(db);

  // 환율 캐시. 원(KRW) 1에 대한 상대 통화의 값을 날짜별로 쌓는다.
  // 매 요청마다 외부 API를 부르면 화면이 남의 서버 사정에 묶이므로 하루치를 받아 두고 쓴다.
  // 지난 날짜 행도 지우지 않는다 — API가 죽었을 때 마지막으로 받은 값이라도 보여 주기 위해서다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS fx_rates (
      date  TEXT NOT NULL,
      quote TEXT NOT NULL,
      rate  REAL NOT NULL,
      PRIMARY KEY (date, quote)
    );
  `);

  // 가져오기 이력. **되돌리기 하나 때문에 있는 표다** — 파일을 넣은 뒤 "아니다" 싶을 때
  // 한 건씩 지우게 하면 스무 건짜리도 손이 못 간다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      label      TEXT NOT NULL DEFAULT '',
      added      INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 앱 설정 한 줌. 키-값 한 표로 두는 이유: 설정마다 열을 늘리면 항목이 하나 늘 때마다
  // 마이그레이션이 붙는데, 여기 들어올 것은 켜고 끄는 스위치 몇 개뿐이다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 구글 캘린더 연결. **행이 하나뿐이다**(CHECK id = 1) — 혼자 쓰는 로컬 앱이라
  // 계정을 여러 개 붙일 일이 없고, 하나로 못박아 두면 '어느 계정이더라'를 물을 일도 없다.
  //
  // refresh_token은 사실상 비밀번호다. 이 표는 data/app.db 안에 있고 그 파일은
  // gitignore되지만, **백업(.ics)에는 절대 싣지 않는다** — 백업은 남에게 건네는 물건이다.
  db.exec(`
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
function seedLeaveTypes(db: DatabaseSync) {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM leave_types`).get() as { n: number };
  if (n > 0) return;

  const insert = db.prepare(
    `INSERT INTO leave_types (name, cycle, anchor_date, min_unit, carry_over, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  // 연차: 입사일 기준 · 반반차까지 · 소멸
  insert.run("연차", "anniversary", null, 0.25, 0, 0);
  // 특별휴가: 달력해 · 하루 단위만 · 연말 소멸
  insert.run("특별휴가", "calendar", null, 1, 0, 1);

  const annual = db.prepare(`SELECT id FROM leave_types WHERE sort_order = 0`).get() as
    | { id: number }
    | undefined;
  if (!annual) return;

  // 예전에 넣어 둔 연도별 총 연차를 그대로 옮긴다. 잃는 것 없이 새 구조로 넘어간다.
  const old = db.prepare(`SELECT year, total_days FROM leave_budget`).all() as unknown as Array<{
    year: number;
    total_days: number;
  }>;
  const grant = db.prepare(
    `INSERT OR IGNORE INTO leave_grants (type_id, period_start, total_days) VALUES (?, ?, ?)`
  );
  for (const row of old) grant.run(annual.id, `${row.year}-01-01`, row.total_days);

  // 기존 연차 일정에도 종류를 달아 준다
  db.prepare(`UPDATE events SET leave_type_id = ? WHERE is_leave = 1 AND leave_type_id IS NULL`).run(
    annual.id
  );
}

function seed(db: DatabaseSync) {
  // 공휴일은 lib/holidays.ts가 규칙으로 만들어 낸다.
  // 규칙을 고쳤을 때 예전에 잘못 들어간 행이 남지 않도록 통째로 갈아 끼운다.
  const thisYear = Number(today().slice(0, 4));
  db.exec(`DELETE FROM holidays`);
  const insertHoliday = db.prepare(`INSERT INTO holidays (date, name, kind) VALUES (?, ?, ?)`);
  for (const h of buildHolidays(thisYear, thisYear + HOLIDAY_YEARS)) {
    insertHoliday.run(h.date, h.name, h.kind);
  }

  // 일정: 비어 있을 때만 넣는다. 빈 화면으로 시작하지 않게 하는 용도.
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM events`).get() as { n: number };
  if (n > 0) return;

  const t = today();
  const insert = db.prepare(
    `INSERT INTO events (title, date, end_date, start_time, end_time, memo, done, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

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

  for (const r of rows) insert.run(...r);
}

export function getDb(): DatabaseSync {
  if (!globalForDb.__appDb) globalForDb.__appDb = createDb();
  return globalForDb.__appDb;
}

/**
 * WAL을 본체 파일로 밀어 넣는다.
 *
 * WAL 모드에서는 최근 쓰기가 `app.db-wal`에만 있다. 서버가 뜬 채로 `app.db` 하나만
 * 복사하면(파일 동기화 도구가 흔히 하는 일) **그 사이 넣은 일정이 통째로 빠진 DB**를 얻는다.
 * 실제로 본체 60KB에 WAL이 4MB까지 자란 것을 확인했다.
 *
 * 백업을 내보내기 직전에 부른다 — 그때가 "지금까지의 데이터"를 확정해야 하는 순간이다.
 */
export function checkpoint(): void {
  try {
    getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // 체크포인트는 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
    // 다른 커넥션이 읽는 중이면 실패할 수 있는데, 그때도 백업 자체는 나가야 한다.
  }
}
