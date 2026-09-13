import { NextResponse } from "next/server";
import {
  isOffline,
  isRecommendationEnabled,
  setOffline,
  setRecommendationEnabled,
} from "@/lib/settings";

/** GET → 현재 설정 / PATCH → 오프라인 모드·연휴 추천 켜고 끄기 */

export async function GET() {
  return NextResponse.json({
    offline: await isOffline(),
    recommendations: await isRecommendationEnabled(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    offline?: unknown;
    recommendations?: unknown;
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

  return NextResponse.json({
    offline: await isOffline(),
    recommendations: await isRecommendationEnabled(),
  });
}
