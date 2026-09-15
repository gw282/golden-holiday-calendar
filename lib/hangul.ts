/**
 * 초성 검색 — "ㅈㄱㅎㅇ" → "주간회의". 외부 라이브러리(hangul-js 등) 없이
 * 완성형 한글 유니코드 분해만으로 충분해 직접 짰다. DB/lib 미참조라
 * 클라이언트에서 그대로 import해도 안전하다.
 */
const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const CHOSUNG_SET = new Set(CHOSUNG);

const SYLLABLE_BASE = 0xac00; // '가'
const SYLLABLE_END = 0xd7a3; // '힣'
const CHOSUNG_UNIT = 21 * 28; // 중성 21개 × 종성 28개

/** 완성형 음절이면 초성만, 아니면(자음·숫자·공백 등) 그대로 돌려준다 */
function chosungOf(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  if (code < SYLLABLE_BASE || code > SYLLABLE_END) return char;
  return CHOSUNG[Math.floor((code - SYLLABLE_BASE) / CHOSUNG_UNIT)];
}

export function toChosung(text: string): string {
  return [...text].map(chosungOf).join("");
}

/** 입력이 초성 자음으로만 이루어졌는가 — 이때만 초성 검색으로 취급한다 */
export function isChosungQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length > 0 && [...trimmed].every((c) => CHOSUNG_SET.has(c));
}

export function matchesChosung(text: string, query: string): boolean {
  // toChosung은 완성형 음절만 초성으로 바꾸고 공백은 그대로 남긴다(다른 용도에서
  // 원문 구조를 보존하려는 것). 그런데 "치과 예약"처럼 띄어쓰기가 있는 제목은
  // 초성이 "ㅊㄱ ㅇㅇ"가 되어, 공백 없이 입력하는 검색어("ㅊㄱㅇㅇ")와 문자열이
  // 어긋나 아예 안 걸린다. 매칭 비교에서만 공백을 지운다.
  return toChosung(text).replace(/\s+/g, "").includes(query);
}
