import { NextResponse } from "next/server";
import {
  getLeaveType,
  leaveSummaries,
  periodOf,
  setGrant,
  summarize,
  updateLeaveType,
} from "@/lib/leave";
import { ValidationError } from "@/lib/events";
import { isValidDateStr, today } from "@/lib/date";

/**
 * 휴가 잔고.
 *
 * 연도가 아니라 **주기**로 다룬다. 연차는 입사일 기준으로 굴러가고 특별휴가는 달력해로
 * 끊기므로 "2026년 연차"라는 요청 자체가 성립하지 않는 경우가 있다.
 * 어느 주기인지는 서버가 `기준 날짜`로부터 계산한다 — 클라이언트가 주기를 알 필요가 없다.
 */

/** `?on=YYYY-MM-DD` — 그 날이 속한 주기를 본다. 없으면 오늘 */
function onDate(request: Request): string | null {
  const raw = new URL(request.url).searchParams.get("on");
  if (raw === null) return today();
  return isValidDateStr(raw) ? raw : null;
}

/** GET /api/leave — 모든 휴가 종류의 주기·지급·사용·잔여 */
export async function GET(request: Request) {
  const on = onDate(request);
  if (on === null) return NextResponse.json({ error: "잘못된 날짜입니다." }, { status: 400 });
  return NextResponse.json({ leaves: await leaveSummaries(on) });
}

/**
 * PUT /api/leave — 그 주기에 받은 일수를 넣거나 고친다.
 * `{ typeId, on?, total }` · total이 null이면 설정을 지운다.
 */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  const { typeId, on, total } = (body ?? {}) as Record<string, unknown>;
  const type = await getLeaveType(Number(typeId));
  if (!type) return NextResponse.json({ error: "휴가 종류를 찾을 수 없습니다." }, { status: 404 });

  const base = typeof on === "string" && isValidDateStr(on) ? on : today();

  try {
    // 주기 시작일은 서버가 정한다. 클라이언트가 보내면 경계를 잘못 계산할 여지가 생긴다.
    await setGrant(
      type.id,
      periodOf(type, base).start,
      total === null || total === "" ? null : Number(total),
    );
    return NextResponse.json({ leave: await summarize(type, base) });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

/**
 * PATCH /api/leave — 휴가 종류 설정(입사일·이름)을 고친다.
 * `{ typeId, anchorDate?, name? }`
 */
export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  const { typeId, anchorDate, name } = (body ?? {}) as Record<string, unknown>;

  try {
    const updated = await updateLeaveType(Number(typeId), {
      anchorDate:
        anchorDate === undefined
          ? undefined
          : anchorDate === null || anchorDate === ""
            ? null
            : String(anchorDate),
      name: name === undefined ? undefined : String(name),
    });
    if (!updated) {
      return NextResponse.json({ error: "휴가 종류를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ leave: await summarize(updated) });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
