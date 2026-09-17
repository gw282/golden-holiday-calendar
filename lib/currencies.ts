/**
 * 환산해 보여 줄 통화 목록.
 *
 * 이 파일은 **DB를 import하지 않는다.** 환산 화면이 클라이언트 컴포넌트라
 * `lib/fx.ts`에서 값을 가져오면 `@libsql/client`가 클라이언트 번들로 끌려온다.
 * `lib/eventColors.ts`를 따로 뺀 것과 같은 이유다.
 */
export type Currency = {
  code: string;
  label: string;
  /**
   * 국기 이미지에 쓰는 ISO 3166-1 alpha-2 코드(소문자).
   *
   * 국기 **이모지**(🇯🇵)를 쓰지 않는 이유: 윈도우에는 국기 글꼴이 없어서
   * Chrome·Edge가 `JP`처럼 **글자 두 개로** 그린다. 그림이 필요한 자리라 이미지를 쓴다.
   */
  cc: string;
  /** 화면에 적는 단위 이름. '일본 엔'이 아니라 '엔' */
  unit: string;
  /**
   * 몇 단위를 기준으로 환율을 적을지. **한국 은행 고시 관행**을 따른다 —
   * 엔은 `100엔 = 858원`으로 적지 `1엔 = 8.58원`이라고 하지 않는다.
   * 동·루피아처럼 잘게 쪼개지는 돈도 100 단위여야 읽을 수 있는 숫자가 나온다.
   */
  unitBase: number;
};

/**
 * 한국에서 나가는 여행지 순으로 골랐다.
 *
 * **`lib/flights.ts`의 도착지가 쓰는 통화는 반드시 여기 있어야 한다.** 항공권에서 도착지를
 * 고르면 아래 환산 카드를 짚어 주는데, 통화가 빠져 있으면 짚을 카드가 없다.
 */
export const FX_CURRENCIES: ReadonlyArray<Currency> = [
  { code: "JPY", label: "일본 엔", cc: "jp", unit: "엔", unitBase: 100 },
  { code: "USD", label: "미국 달러", cc: "us", unit: "달러", unitBase: 1 },
  { code: "EUR", label: "유로", cc: "eu", unit: "유로", unitBase: 1 },
  { code: "CNY", label: "중국 위안", cc: "cn", unit: "위안", unitBase: 1 },
  { code: "VND", label: "베트남 동", cc: "vn", unit: "동", unitBase: 100 },
  { code: "THB", label: "태국 바트", cc: "th", unit: "바트", unitBase: 1 },
  { code: "TWD", label: "대만 달러", cc: "tw", unit: "대만달러", unitBase: 1 },
  { code: "SGD", label: "싱가포르 달러", cc: "sg", unit: "싱가포르달러", unitBase: 1 },
  { code: "HKD", label: "홍콩 달러", cc: "hk", unit: "홍콩달러", unitBase: 1 },
  { code: "PHP", label: "필리핀 페소", cc: "ph", unit: "페소", unitBase: 1 },
  { code: "IDR", label: "인도네시아 루피아", cc: "id", unit: "루피아", unitBase: 100 },
  { code: "GBP", label: "영국 파운드", cc: "gb", unit: "파운드", unitBase: 1 },
  { code: "AUD", label: "호주 달러", cc: "au", unit: "호주달러", unitBase: 1 },
  { code: "NZD", label: "뉴질랜드 달러", cc: "nz", unit: "뉴질랜드달러", unitBase: 1 },
  { code: "CAD", label: "캐나다 달러", cc: "ca", unit: "캐나다달러", unitBase: 1 },
  { code: "CHF", label: "스위스 프랑", cc: "ch", unit: "프랑", unitBase: 1 },
  { code: "CZK", label: "체코 코루나", cc: "cz", unit: "코루나", unitBase: 1 },
  { code: "TRY", label: "튀르키예 리라", cc: "tr", unit: "리라", unitBase: 1 },
  { code: "RUB", label: "러시아 루블", cc: "ru", unit: "루블", unitBase: 1 },
  { code: "AED", label: "아랍에미리트 디르함", cc: "ae", unit: "디르함", unitBase: 1 },
  { code: "INR", label: "인도 루피", cc: "in", unit: "루피", unitBase: 1 },
  { code: "MYR", label: "말레이시아 링깃", cc: "my", unit: "링깃", unitBase: 1 },
  { code: "MOP", label: "마카오 파타카", cc: "mo", unit: "파타카", unitBase: 1 },
  { code: "MNT", label: "몽골 투그릭", cc: "mn", unit: "투그릭", unitBase: 100 },
  { code: "KHR", label: "캄보디아 리엘", cc: "kh", unit: "리엘", unitBase: 100 },
  { code: "KRW", label: "대한민국 원", cc: "kr", unit: "원", unitBase: 1 },
];

/** 국기 이미지 주소. flagcdn은 키가 필요 없고 SVG·PNG를 다 준다 */
export function flagUrl(cc: string): string {
  return `https://flagcdn.com/w40/${cc}.png`;
}
