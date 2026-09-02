import { getDb } from "./db";
import { ValidationError } from "./events";

/**
 * 기간 일정에 딸린 준비물 · 할 일.
 *
 * 별도 표(`event_tasks`)로 둔 이유: 이것들을 일정으로 만들면 "여권 챙기기"가 달력에
 * 한 칸씩 들어가 잡일로 덮인다. 날짜가 없는 항목이라 `events`의 스키마와도 안 맞는다.
 *
 * 일정을 지우면 `ON DELETE CASCADE`로 같이 사라진다 — 지우는 코드를 따로 두지 않는다.
 */

export type Task = {
  id: number;
  eventId: number;
  text: string;
  done: boolean;
};

type TaskRow = { id: number; event_id: number; text: string; done: number };

/** 한 일정에 달 수 있는 항목 수 상한 */
export const MAX_TASKS = 50;
const MAX_TEXT = 100;

function toTask(r: TaskRow): Task {
  return { id: r.id, eventId: r.event_id, text: r.text, done: Boolean(r.done) };
}

/** 넣은 순서대로. 완료된 것을 아래로 내리지 않는다 — 목록이 눌릴 때마다 움직이면 읽기 어렵다 */
export function listTasks(eventId: number): Task[] {
  const rows = getDb()
    .prepare(`SELECT id, event_id, text, done FROM event_tasks WHERE event_id = ? ORDER BY id`)
    .all(eventId) as unknown as TaskRow[];
  return rows.map(toTask);
}

export function createTask(eventId: number, text: unknown): Task {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) throw new ValidationError("할 일을 입력해 주세요.");
  if (value.length > MAX_TEXT) throw new ValidationError(`${MAX_TEXT}자까지 쓸 수 있습니다.`);

  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM events WHERE id = ?`).get(eventId);
  if (exists === undefined) throw new ValidationError("일정을 찾을 수 없습니다.");

  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM event_tasks WHERE event_id = ?`).get(eventId) as {
    n: number;
  };
  if (n >= MAX_TASKS) throw new ValidationError(`한 일정에 ${MAX_TASKS}개까지 넣을 수 있습니다.`);

  const { lastInsertRowid } = db
    .prepare(`INSERT INTO event_tasks (event_id, text) VALUES (?, ?)`)
    .run(eventId, value);

  return { id: Number(lastInsertRowid), eventId, text: value, done: false };
}

export function setTaskDone(id: number, done: boolean): Task | null {
  const db = getDb();
  db.prepare(`UPDATE event_tasks SET done = ? WHERE id = ?`).run(done ? 1 : 0, id);
  const row = db
    .prepare(`SELECT id, event_id, text, done FROM event_tasks WHERE id = ?`)
    .get(id) as unknown as TaskRow | undefined;
  return row ? toTask(row) : null;
}

export function deleteTask(id: number): boolean {
  const { changes } = getDb().prepare(`DELETE FROM event_tasks WHERE id = ?`).run(id);
  return Number(changes) > 0;
}
