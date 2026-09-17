import { NextResponse } from "next/server";
import {
  getReminderThresholds,
  getNotificationTest,
  getWeekStart,
  getHourlyChimeAnchor,
  isStartTimeReminderEnabled,
  isHourlyChimeEnabled,
  isOffline,
  isRecommendationEnabled,
  REMINDER_THRESHOLD_OPTIONS,
  setHourlyChimeEnabled,
  setHourlyChimeAnchor,
  setOffline,
  setReminderThresholds,
  setStartTimeReminderEnabled,
  setRecommendationEnabled,
  setWeekStart,
  requestNotificationTest,
} from "@/lib/settings";

/**
 * GET → 현재 설정 / PATCH → 오프라인 모드·연휴 추천·알림 시점 켜고 끄기
 *
 * `reminderThresholds`는 Tauri 설치본의 Rust 백그라운드 스레드도 30초마다 이 라우트를
 * 그대로 불러 읽는다 — 화면에서 바꾸면 앱을 다시 켜지 않아도 다음 폴링부터 반영된다.
 */

export async function GET() {
  return NextResponse.json({
    offline: await isOffline(),
    recommendations: await isRecommendationEnabled(),
    reminderThresholds: await getReminderThresholds(),
    startTimeReminder: await isStartTimeReminderEnabled(),
    notificationTest: await getNotificationTest(),
    hourlyChime: await isHourlyChimeEnabled(),
    hourlyChimeAnchor: await getHourlyChimeAnchor(),
    weekStart: await getWeekStart(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    offline?: unknown;
    recommendations?: unknown;
    reminderThresholds?: unknown;
    startTimeReminder?: unknown;
    notificationTest?: unknown;
    hourlyChime?: unknown;
    hourlyChimeAnchor?: unknown;
    weekStart?: unknown;
  };

  if (body.offline !== undefined) {
    if (typeof body.offline !== "boolean") {
      return NextResponse.json({ error: "offline은 true/false여야 합니다." }, { status: 400 });
    }
    await setOffline(body.offline);
  }

  if (body.recommendations !== undefined) {
    if (typeof body.recommendations !== "boolean") {
      return NextResponse.json({ error: "recommendations는 true/false여야 합니다." }, { status: 400 });
    }
    await setRecommendationEnabled(body.recommendations);
  }

  if (body.reminderThresholds !== undefined) {
    if (
      !Array.isArray(body.reminderThresholds) ||
      !body.reminderThresholds.every((n) => typeof n === "number")
    ) {
      return NextResponse.json(
        { error: `reminderThresholds는 숫자 배열이어야 합니다 (${REMINDER_THRESHOLD_OPTIONS.join("/")} 중)` },
        { status: 400 },
      );
    }
    await setReminderThresholds(body.reminderThresholds);
  }

  if (body.hourlyChime !== undefined) {
    if (typeof body.hourlyChime !== "boolean") {
      return NextResponse.json({ error: "hourlyChime은 true/false여야 합니다." }, { status: 400 });
    }
    await setHourlyChimeEnabled(body.hourlyChime);
  }

  if (body.hourlyChimeAnchor !== undefined) {
    if (typeof body.hourlyChimeAnchor !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.hourlyChimeAnchor)) {
      return NextResponse.json({ error: "hourlyChimeAnchor는 HH:MM 형식이어야 합니다." }, { status: 400 });
    }
    await setHourlyChimeAnchor(body.hourlyChimeAnchor);
  }

  if (body.startTimeReminder !== undefined) {
    if (typeof body.startTimeReminder !== "boolean") {
      return NextResponse.json({ error: "startTimeReminder는 true/false여야 합니다." }, { status: 400 });
    }
    await setStartTimeReminderEnabled(body.startTimeReminder);
  }

  if (body.notificationTest !== undefined) {
    if (body.notificationTest !== true) {
      return NextResponse.json({ error: "notificationTest는 true여야 합니다." }, { status: 400 });
    }
    await requestNotificationTest();
  }

  if (body.weekStart !== undefined) {
    if (body.weekStart !== "mon" && body.weekStart !== "sun") {
      return NextResponse.json({ error: "weekStart는 mon/sun 중 하나여야 합니다." }, { status: 400 });
    }
    await setWeekStart(body.weekStart);
  }

  return NextResponse.json({
    offline: await isOffline(),
    recommendations: await isRecommendationEnabled(),
    reminderThresholds: await getReminderThresholds(),
    startTimeReminder: await isStartTimeReminderEnabled(),
    notificationTest: await getNotificationTest(),
    hourlyChime: await isHourlyChimeEnabled(),
    hourlyChimeAnchor: await getHourlyChimeAnchor(),
    weekStart: await getWeekStart(),
  });
}
