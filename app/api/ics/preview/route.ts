import { NextResponse } from "next/server";
import { previewIcs } from "@/lib/importIcs";

/**
 * 넣기 전에 무엇이 들어올지 읽어만 본다. **아무것도 저장하지 않는다.**
 *
 * 같은 파일을 확정할 때 한 번 더 보내는 것이 낭비처럼 보이지만, 서버가 파싱 결과를
 * 들고 있으려면 세션이 필요하다. 로컬 앱에서 몇 KB짜리 텍스트를 두 번 보내는 편이
 * 훨씬 싸고, 미리보기와 확정이 **같은 파서를 두 번 거치므로 어긋날 수도 없다.**
 */
export async function POST(request: Request) {
  const text = await request.text();
  if (!text.includes("BEGIN:VEVENT")) {
    return NextResponse.json({ error: "일정이 들어 있는 .ics 파일이 아닙니다." }, { status: 400 });
  }
  return NextResponse.json(await previewIcs(text));
}
