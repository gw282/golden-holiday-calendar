/**
 * 항공권 검색 링크.
 *
 * **가격을 직접 가져오지 않는다.** 항공권 가격 API는 무료로 쓸 수 있는 것이 사실상 없다 —
 * 스카이스캐너·Kiwi는 파트너 승인이 필요하고, 구글 플라이트는 공개 API가 없으며,
 * Amadeus 무료 티어는 키 발급과 월 호출 제한이 붙는 데다 테스트 환경 값이 실제와 다르다.
 *
 * 대신 이 앱이 이미 아는 것(출발일·귀국일)을 채운 **검색 주소**를 만들어 넘긴다.
 * 키도 쿼터도 이용약관 문제도 없고, 가격은 항상 최신이며, 캐시가 상할 일이 없다.
 *
 * 이 파일은 DB를 import하지 않는다 — 클라이언트 컴포넌트가 쓴다.
 */

export type Airport = {
  code: string;
  city: string;
  country: string;
};

export type Destination = Airport & {
  /**
   * 그 나라에서 쓰는 통화. 도착지를 고르면 아래 환산 카드를 짚어 주는 데 쓴다.
   * **여기 적는 코드는 `lib/currencies.ts`의 FX_CURRENCIES에 반드시 있어야 한다.**
   */
  currency: string;
  /** 인천 기준 직항 비행시간(시간). 항공사·기류마다 달라 어림값이다 */
  hours: number;
  /** 표준시 UTC 오프셋. 한국(+9)과의 차이를 여기서 뺀다.
   *  서머타임은 넣지 않았다 — 나라마다 기간이 달라 하드코딩하면 반년은 틀린 값이 된다 */
  utcOffset: number;
  /** 숙소 검색 주소에 넣을 이름. 한글을 그대로 넣으면 못 찾는 사이트가 있다 */
  searchName: string;
  /**
   * 아고다 도시 페이지 슬러그(`/ko-kr/city/<slug>.html`).
   *
   * 아고다는 글자 검색 파라미터를 조용히 무시할 수 있어(빈 검색 화면이 열린다)
   * 도시 페이지를 직접 연다. 이 방식은 **없는 슬러그면 404가 나서 검증이 된다** —
   * 여기 적힌 18개는 전부 200을 확인했다. 도착지를 늘릴 때도 반드시 찍어 볼 것.
   */
  agodaSlug: string;
  /** 국내선. 네이버는 국제선과 주소 경로가 다르고, 환율도 볼 것이 없다 */
  domestic?: true;
  /**
   * 공항이 없거나 비행기로 갈 일이 아닌 곳(경주·전주 등).
   * 항공권 링크를 감추고 숙소만 남긴다 — 안 되는 링크를 두면 앱을 못 믿게 된다.
   */
  noFlight?: true;
};

/** 한국 표준시. 시차 계산의 기준 */
const KST_OFFSET = 9;

/** 한국 기준 시차. +면 현지가 빠르다 */
export function timeDiffFromKorea(d: Destination): number {
  return d.utcOffset - KST_OFFSET;
}

/** 출발지. 인천·김포·김해·대구·제주 — 국제선이 뜨는 곳만 */
export const ORIGINS: ReadonlyArray<Airport> = [
  { code: "ICN", city: "인천", country: "대한민국" },
  { code: "GMP", city: "김포", country: "대한민국" },
  { code: "PUS", city: "부산(김해)", country: "대한민국" },
  { code: "TAE", city: "대구", country: "대한민국" },
  { code: "CJU", city: "제주", country: "대한민국" },
];

/** 도착지. 연차 2~3일로 다녀올 만한 거리부터 순서대로 */
/**
 * 도착지. 나라별로 묶어 두고, 가까운 곳부터 적는다.
 *
 * **agodaSlug는 전부 실제로 찍어 200을 확인했다.** 없는 슬러그는 404가 나므로
 * 도착지를 늘릴 때도 반드시 확인할 것 (`frankfurt-de`·`seattle-us`처럼
 * 짐작한 이름이 틀린 경우가 실제로 있었다).
 * currency는 `lib/currencies.ts`의 FX_CURRENCIES에 있어야 한다.
 */
export const DESTINATIONS: ReadonlyArray<Destination> = [
  // ── 국내 ── 비행시간은 김포/인천 기준. 제주 말고는 기차가 빠른 곳이 많다
  { code: "CJU", city: "제주", country: "대한민국", currency: "KRW", hours: 1, utcOffset: 9, searchName: "Jeju", agodaSlug: "jeju-kr", domestic: true },
  { code: "PUS", city: "부산", country: "대한민국", currency: "KRW", hours: 1, utcOffset: 9, searchName: "Busan", agodaSlug: "busan-kr", domestic: true },
  { code: "SEL", city: "서울", country: "대한민국", currency: "KRW", hours: 0, utcOffset: 9, searchName: "Seoul", agodaSlug: "seoul-kr", domestic: true, noFlight: true },
  { code: "YNY", city: "속초·양양", country: "대한민국", currency: "KRW", hours: 0, utcOffset: 9, searchName: "Sokcho", agodaSlug: "sokcho-kr", domestic: true, noFlight: true },
  { code: "KAG", city: "강릉", country: "대한민국", currency: "KRW", hours: 0, utcOffset: 9, searchName: "Gangneung", agodaSlug: "gangneung-si-kr", domestic: true, noFlight: true },
  { code: "GJU", city: "경주", country: "대한민국", currency: "KRW", hours: 0, utcOffset: 9, searchName: "Gyeongju", agodaSlug: "gyeongju-si-kr", domestic: true, noFlight: true },
  { code: "RSU", city: "여수", country: "대한민국", currency: "KRW", hours: 1, utcOffset: 9, searchName: "Yeosu", agodaSlug: "yeosu-si-kr", domestic: true },
  { code: "JNU", city: "전주", country: "대한민국", currency: "KRW", hours: 0, utcOffset: 9, searchName: "Jeonju", agodaSlug: "jeonju-si-kr", domestic: true, noFlight: true },
  // ── 일본 ──
  { code: "NRT", city: "도쿄", country: "일본", currency: "JPY", hours: 2.5, utcOffset: 9, searchName: "Tokyo", agodaSlug: "tokyo-jp" },
  { code: "KIX", city: "오사카", country: "일본", currency: "JPY", hours: 2, utcOffset: 9, searchName: "Osaka", agodaSlug: "osaka-jp" },
  { code: "FUK", city: "후쿠오카", country: "일본", currency: "JPY", hours: 1.5, utcOffset: 9, searchName: "Fukuoka", agodaSlug: "fukuoka-jp" },
  { code: "NGO", city: "나고야", country: "일본", currency: "JPY", hours: 2, utcOffset: 9, searchName: "Nagoya", agodaSlug: "nagoya-jp" },
  { code: "CTS", city: "삿포로", country: "일본", currency: "JPY", hours: 3, utcOffset: 9, searchName: "Sapporo", agodaSlug: "sapporo-jp" },
  { code: "OKA", city: "오키나와", country: "일본", currency: "JPY", hours: 2.5, utcOffset: 9, searchName: "Okinawa", agodaSlug: "okinawa-jp" },
  // ── 중화권 ──
  { code: "TPE", city: "타이베이", country: "대만", currency: "TWD", hours: 2.5, utcOffset: 8, searchName: "Taipei", agodaSlug: "taipei-tw" },
  { code: "KHH", city: "가오슝", country: "대만", currency: "TWD", hours: 3, utcOffset: 8, searchName: "Kaohsiung", agodaSlug: "kaohsiung-tw" },
  { code: "HKG", city: "홍콩", country: "홍콩", currency: "HKD", hours: 3.5, utcOffset: 8, searchName: "Hong Kong", agodaSlug: "hong-kong-hk" },
  { code: "MFM", city: "마카오", country: "마카오", currency: "MOP", hours: 3.5, utcOffset: 8, searchName: "Macau", agodaSlug: "macau-mo" },
  { code: "PVG", city: "상하이", country: "중국", currency: "CNY", hours: 2, utcOffset: 8, searchName: "Shanghai", agodaSlug: "shanghai-cn" },
  { code: "PEK", city: "베이징", country: "중국", currency: "CNY", hours: 2, utcOffset: 8, searchName: "Beijing", agodaSlug: "beijing-cn" },
  { code: "TAO", city: "칭다오", country: "중국", currency: "CNY", hours: 1.5, utcOffset: 8, searchName: "Qingdao", agodaSlug: "qingdao-cn" },
  { code: "CAN", city: "광저우", country: "중국", currency: "CNY", hours: 3.5, utcOffset: 8, searchName: "Guangzhou", agodaSlug: "guangzhou-cn" },
  // ── 동남아 ──
  { code: "DAD", city: "다낭", country: "베트남", currency: "VND", hours: 5, utcOffset: 7, searchName: "Da Nang", agodaSlug: "da-nang-vn" },
  { code: "HAN", city: "하노이", country: "베트남", currency: "VND", hours: 4.5, utcOffset: 7, searchName: "Hanoi", agodaSlug: "hanoi-vn" },
  { code: "SGN", city: "호찌민", country: "베트남", currency: "VND", hours: 5.5, utcOffset: 7, searchName: "Ho Chi Minh City", agodaSlug: "ho-chi-minh-city-vn" },
  { code: "CXR", city: "나트랑", country: "베트남", currency: "VND", hours: 5, utcOffset: 7, searchName: "Nha Trang", agodaSlug: "nha-trang-vn" },
  { code: "PQC", city: "푸꾸옥", country: "베트남", currency: "VND", hours: 5.5, utcOffset: 7, searchName: "Phu Quoc", agodaSlug: "phu-quoc-island-vn" },
  { code: "BKK", city: "방콕", country: "태국", currency: "THB", hours: 6, utcOffset: 7, searchName: "Bangkok", agodaSlug: "bangkok-th" },
  { code: "HKT", city: "푸껫", country: "태국", currency: "THB", hours: 6.5, utcOffset: 7, searchName: "Phuket", agodaSlug: "phuket-th" },
  { code: "CNX", city: "치앙마이", country: "태국", currency: "THB", hours: 6, utcOffset: 7, searchName: "Chiang Mai", agodaSlug: "chiang-mai-th" },
  { code: "SIN", city: "싱가포르", country: "싱가포르", currency: "SGD", hours: 6.5, utcOffset: 8, searchName: "Singapore", agodaSlug: "singapore-sg" },
  { code: "KUL", city: "쿠알라룸푸르", country: "말레이시아", currency: "MYR", hours: 6.5, utcOffset: 8, searchName: "Kuala Lumpur", agodaSlug: "kuala-lumpur-my" },
  { code: "CEB", city: "세부", country: "필리핀", currency: "PHP", hours: 4.5, utcOffset: 8, searchName: "Cebu", agodaSlug: "cebu-ph" },
  { code: "MNL", city: "마닐라", country: "필리핀", currency: "PHP", hours: 4, utcOffset: 8, searchName: "Manila", agodaSlug: "manila-ph" },
  { code: "KLO", city: "보라카이", country: "필리핀", currency: "PHP", hours: 4.5, utcOffset: 8, searchName: "Boracay", agodaSlug: "boracay-island-ph" },
  { code: "DPS", city: "발리", country: "인도네시아", currency: "IDR", hours: 7, utcOffset: 8, searchName: "Bali", agodaSlug: "bali-id" },
  { code: "CGK", city: "자카르타", country: "인도네시아", currency: "IDR", hours: 7, utcOffset: 7, searchName: "Jakarta", agodaSlug: "jakarta-id" },
  { code: "REP", city: "씨엠립", country: "캄보디아", currency: "KHR", hours: 5.5, utcOffset: 7, searchName: "Siem Reap", agodaSlug: "siem-reap-kh" },
  // ── 그 밖의 아시아·중동 ──
  { code: "UBN", city: "울란바토르", country: "몽골", currency: "MNT", hours: 3.5, utcOffset: 8, searchName: "Ulaanbaatar", agodaSlug: "ulaanbaatar-mn" },
  { code: "VVO", city: "블라디보스토크", country: "러시아", currency: "RUB", hours: 2.5, utcOffset: 10, searchName: "Vladivostok", agodaSlug: "vladivostok-ru" },
  { code: "DEL", city: "델리", country: "인도", currency: "INR", hours: 8.5, utcOffset: 5.5, searchName: "Delhi", agodaSlug: "delhi-in" },
  { code: "DXB", city: "두바이", country: "아랍에미리트", currency: "AED", hours: 10, utcOffset: 4, searchName: "Dubai", agodaSlug: "dubai-ae" },
  { code: "IST", city: "이스탄불", country: "튀르키예", currency: "TRY", hours: 11.5, utcOffset: 3, searchName: "Istanbul", agodaSlug: "istanbul-tr" },
  // ── 태평양 ──
  { code: "GUM", city: "괌", country: "미국", currency: "USD", hours: 4.5, utcOffset: 10, searchName: "Guam", agodaSlug: "guam-gu" },
  { code: "SPN", city: "사이판", country: "미국", currency: "USD", hours: 4.5, utcOffset: 10, searchName: "Saipan", agodaSlug: "saipan-mp" },
  { code: "HNL", city: "호놀룰루", country: "미국", currency: "USD", hours: 8.5, utcOffset: -10, searchName: "Honolulu", agodaSlug: "honolulu-hi-us" },
  // ── 유럽 ──
  { code: "CDG", city: "파리", country: "프랑스", currency: "EUR", hours: 12.5, utcOffset: 1, searchName: "Paris", agodaSlug: "paris-fr" },
  { code: "LHR", city: "런던", country: "영국", currency: "GBP", hours: 12.5, utcOffset: 0, searchName: "London", agodaSlug: "london-gb" },
  { code: "FRA", city: "프랑크푸르트", country: "독일", currency: "EUR", hours: 11.5, utcOffset: 1, searchName: "Frankfurt", agodaSlug: "frankfurt-am-main-de" },
  { code: "FCO", city: "로마", country: "이탈리아", currency: "EUR", hours: 12, utcOffset: 1, searchName: "Rome", agodaSlug: "rome-it" },
  { code: "BCN", city: "바르셀로나", country: "스페인", currency: "EUR", hours: 13, utcOffset: 1, searchName: "Barcelona", agodaSlug: "barcelona-es" },
  { code: "AMS", city: "암스테르담", country: "네덜란드", currency: "EUR", hours: 11.5, utcOffset: 1, searchName: "Amsterdam", agodaSlug: "amsterdam-nl" },
  { code: "VIE", city: "빈", country: "오스트리아", currency: "EUR", hours: 11.5, utcOffset: 1, searchName: "Vienna", agodaSlug: "vienna-at" },
  { code: "PRG", city: "프라하", country: "체코", currency: "CZK", hours: 11.5, utcOffset: 1, searchName: "Prague", agodaSlug: "prague-cz" },
  { code: "ZRH", city: "취리히", country: "스위스", currency: "CHF", hours: 12, utcOffset: 1, searchName: "Zurich", agodaSlug: "zurich-ch" },
  // ── 북미·오세아니아 ──
  { code: "JFK", city: "뉴욕", country: "미국", currency: "USD", hours: 14, utcOffset: -5, searchName: "New York", agodaSlug: "new-york-us" },
  { code: "LAX", city: "로스앤젤레스", country: "미국", currency: "USD", hours: 11, utcOffset: -8, searchName: "Los Angeles", agodaSlug: "los-angeles-us" },
  { code: "SFO", city: "샌프란시스코", country: "미국", currency: "USD", hours: 10.5, utcOffset: -8, searchName: "San Francisco", agodaSlug: "san-francisco-ca-us" },
  { code: "SEA", city: "시애틀", country: "미국", currency: "USD", hours: 10, utcOffset: -8, searchName: "Seattle", agodaSlug: "seattle-wa-us" },
  { code: "YVR", city: "밴쿠버", country: "캐나다", currency: "CAD", hours: 10, utcOffset: -8, searchName: "Vancouver", agodaSlug: "vancouver-bc-ca" },
  { code: "SYD", city: "시드니", country: "호주", currency: "AUD", hours: 10.5, utcOffset: 10, searchName: "Sydney", agodaSlug: "sydney-au" },
  { code: "AKL", city: "오클랜드", country: "뉴질랜드", currency: "NZD", hours: 11.5, utcOffset: 12, searchName: "Auckland", agodaSlug: "auckland-nz" },
];

export function findDestination(code: string): Destination | null {
  return DESTINATIONS.find((d) => d.code === code) ?? null;
}

/** 공항 코드 -> 그 나라 통화. 모르는 코드면 null */
export function currencyOfDestination(code: string): string | null {
  return DESTINATIONS.find((d) => d.code === code)?.currency ?? null;
}

export type FlightSite = {
  key: string;
  label: string;
  /** 좁은 자리(달력 화면)에 쓰는 짧은 이름. 로고를 못 받았을 때의 대체 표기이기도 하다 */
  short: string;
  /** 로고(파비콘)를 받아올 도메인. logoUrl() 참고 */
  logoDomain: string;
  /** 왕복 검색 주소 */
  url: (o: {
    from: string;
    to: string;
    depart: string;
    ret: string;
    adults: number;
    /** 국내선이면 주소 경로가 달라지는 사이트가 있다 (네이버) */
    domestic?: boolean;
  }) => string;
};

export type StaySite = {
  key: string;
  label: string;
  short: string;
  logoDomain: string;
  url: (o: {
    /** 글자 검색용 도시 이름 (searchName) */
    city: string;
    /** 아고다 도시 페이지 슬러그 (agodaSlug) */
    slug: string;
    checkIn: string;
    checkOut: string;
    adults: number;
  }) => string;
};

/**
 * 날짜 형식이 사이트마다 다르다. 한쪽에 맞추면 다른 쪽이 조용히 엉뚱한 날을 연다.
 * 네이버는 8자리(20261002), 스카이스캐너는 6자리(261002)다.
 */
function yyyymmdd(d: string): string {
  return d.replace(/-/g, "");
}

function yymmdd(d: string): string {
  return d.slice(2).replace(/-/g, "");
}

export const FLIGHT_SITES: ReadonlyArray<FlightSite> = [
  {
    key: "naver",
    label: "네이버항공권",
    short: "네이버",
    logoDomain: "flight.naver.com",
    url: ({ from, to, depart, ret, adults, domestic }) =>
      `https://flight.naver.com/flights/${domestic ? "domestic" : "international"}/${from}-${to}-${yyyymmdd(depart)}/${to}-${from}-${yyyymmdd(ret)}?adult=${adults}&fareType=Y`,
  },
  {
    key: "skyscanner",
    label: "스카이스캐너",
    short: "스카이",
    logoDomain: "skyscanner.co.kr",
    url: ({ from, to, depart, ret, adults }) =>
      `https://www.skyscanner.co.kr/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${yymmdd(depart)}/${yymmdd(ret)}/?adults=${adults}`,
  },
  {
    key: "google",
    label: "구글 플라이트",
    short: "구글",
    logoDomain: "google.com",
    url: ({ from, to, depart, ret }) =>
      `https://www.google.com/travel/flights?q=${encodeURIComponent(
        `Flights from ${from} to ${to} on ${depart} through ${ret}`
      )}`,
  },
];

/**
 * 숙소 검색. 항공권과 같은 방식 — 가격을 가져오지 않고 **날짜가 채워진 검색 주소**만 연다.
 *
 * 부킹·에어비앤비는 도시를 **글자로** 넘길 수 있다. 아고다는 글자 파라미터를 조용히
 * 무시할 수 있어(200은 뜨는데 빈 검색 화면) 도시 페이지 슬러그를 쓴다 — 틀리면 404가 나서
 * 적어도 조용히 엉뚱한 화면이 열리지는 않는다.
 */
export const STAY_SITES: ReadonlyArray<StaySite> = [
  {
    key: "agoda",
    label: "아고다",
    short: "아고다",
    logoDomain: "agoda.com",
    url: ({ slug, checkIn, checkOut, adults }) =>
      `https://www.agoda.com/ko-kr/city/${slug}.html?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&rooms=1`,
  },
  {
    key: "booking",
    label: "부킹닷컴",
    short: "부킹",
    logoDomain: "booking.com",
    url: ({ city, checkIn, checkOut, adults }) =>
      `https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(city)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${adults}`,
  },
  {
    key: "airbnb",
    label: "에어비앤비",
    short: "에어비앤비",
    // airbnb.co.kr은 파비콘이 없다(404). .com은 있다 — 도메인을 바꿀 때 반드시 찍어 볼 것
    logoDomain: "airbnb.com",
    url: ({ city, checkIn, checkOut, adults }) =>
      `https://www.airbnb.co.kr/s/${encodeURIComponent(city)}/homes?checkin=${checkIn}&checkout=${checkOut}&adults=${adults}`,
  },
];

/**
 * 회사 로고(파비콘) 주소.
 *
 * 로고 이미지를 저장소에 넣지 않는다 — 상표를 재배포하는 셈이 되고, 회사가 로고를 바꾸면
 * 우리 것만 옛날 그림으로 남는다. 파비콘을 그때그때 받아 쓴다.
 *
 * DuckDuckGo를 쓰는 이유: 구글 파비콘 서비스는 301로 넘겨서 한 번 더 왕복하고,
 * **없는 도메인에도 지구본 그림을 200으로 준다.** DuckDuckGo는 404를 내서 확인이 된다
 * (실제로 airbnb.co.kr이 404라 .com으로 바꿨다).
 */
export function logoUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}
