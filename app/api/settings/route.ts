import { NextResponse } from "next/server";
import {
  getReminderThresholds,
  isOffline,
  isRecommendationEnabled,
  REMINDER_THRESHOLD_OPTIONS,
  setOffline,
  setReminderThresholds,
  setRecommendationEnabled,
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
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    offline?: unknown;
    recommendations?: unknown;
    reminderThresholds?: unknown;
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

  return NextResponse.json({
    offline: await isOffline(),
    recommendations: await isRecommendationEnabled(),
    reminderThresholds: await getReminderThresholds(),
  });
}
