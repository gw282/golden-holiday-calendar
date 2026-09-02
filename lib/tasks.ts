import { all, get, run } from "./db";
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
export async function listTasks(eventId: number): Promise<Task[]> {
  const rows = await all<TaskRow>(
    `SELECT id, event_id, text, done FROM event_tasks WHERE event_id = ? ORDER BY id`,
    [eventId],
  );
  return rows.map(toTask);
}

export async function createTask(eventId: number, text: unknown): Promise<Task> {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) throw new ValidationError("할 일을 입력해 주세요.");
  if (value.length > MAX_TEXT) throw new ValidationError(`${MAX_TEXT}자까지 쓸 수 있습니다.`);

  const exists = await get(`SELECT 1 FROM events WHERE id = ?`, [eventId]);
  if (exists === undefined) throw new ValidationError("일정을 찾을 수 없습니다.");

  const countRow = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM event_tasks WHERE event_id = ?`,
    [eventId],
  );
  if (Number(countRow?.n ?? 0) >= MAX_TASKS) {
    throw new ValidationError(`한 일정에 ${MAX_TASKS}개까지 넣을 수 있습니다.`);
  }

  const { lastInsertRowid } = await run(
    `INSERT INTO event_tasks (event_id, text) VALUES (?, ?)`,
    [eventId, value],
  );

  return { id: lastInsertRowid, eventId, text: value, done: false };
}

export async function setTaskDone(id: number, done: boolean): Promise<Task | null> {
  await run(`UPDATE event_tasks SET done = ? WHERE id = ?`, [done ? 1 : 0, id]);
  const row = await get<TaskRow>(
    `SELECT id, event_id, text, done FROM event_tasks WHERE id = ?`,
    [id],
  );
  return row ? toTask(row) : null;
}

export async function deleteTask(id: number): Promise<boolean> {
  const { rowsAffected } = await run(`DELETE FROM event_tasks WHERE id = ?`, [id]);
  return rowsAffected > 0;
}
