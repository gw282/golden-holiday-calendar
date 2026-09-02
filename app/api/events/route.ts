import { NextResponse } from "next/server";
import {
  createEvent,
  listEvents,
  listEventsByDate,
  searchEvents,
  ValidationError,
  type CreateInput,
} from "@/lib/events";
import { isValidDateStr } from "@/lib/date";

/** GET /api/events            전체 목록
 *  GET /api/events?q=검색어         제목·메모 부분일치 — `{ events, hasMore }`를 준다.
 *                                   hasMore는 결과가 30건에서 잘렸다는 뜻이다.
 *                                   전체 건수는 세지 않는다 (searchEvents 주석 참고)
 *  GET /api/events?date=YYYY-MM-DD  해당 날짜만 */
export async function GET(request: Request) {
const params = new URL(request.url).searchParams;

  const q = params.get("q");
  // searchEvents가 이미 { events, hasMore } 모양이라 그대로 넘긴다.
  // events 키는 다른 분기와 같아서 기존 소비자가 깨지지 않는다.
  if (q !== null) return NextResponse.json(searchEvents(q));

  const date = params.get("date");

  if (date !== null) {
    if (!isValidDateStr(date)) {
      return NextResponse.json({ error: "date는 'YYYY-MM-DD' 형식이어야 합니다." }, { status: 400 });
    }
    return NextResponse.json({ events: listEventsByDate(date) });
  }

  return NextResponse.json({ events: listEvents() });
}

/** POST /api/events — 일정 추가 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  try {
    const {
      title, date, endDate, startTime, endTime, memo, color, repeat,
      isLeave, leaveTypeId, leaveDays,
    } = (body ?? {}) as Record<string, unknown>;
    const event = createEvent({
      title: title as string,
      date: date as string,
      endDate: endDate as string | null | undefined,
      startTime: startTime as string | null | undefined,
      endTime: endTime as string | null | undefined,
      memo: memo as string | undefined,
      color: color as string | null | undefined,
      repeat: repeat as CreateInput["repeat"],
      isLeave: isLeave as boolean | undefined,
      leaveTypeId: leaveTypeId as number | null | undefined,
      leaveDays: leaveDays as number | null | undefined,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
