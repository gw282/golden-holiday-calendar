@AGENTS.md

# 일정 관리 + 징검다리 연휴 플래너

## 이 앱이 하는 일

**한 화면짜리 대시보드(`/`) 하나**로 되어 있다. 탭은 없다.

| 자리 | 내용 |
| --- | --- |
| 최상단 | 다가오는 일정 (앞으로 2주, 한 줄 가로 스크롤) |
| 왼쪽 | 달력 — 월 그리드에 공휴일 · 일정 · 기간 일정 띠 |
| 오른쪽 | 고른 날의 일정 + 공휴일 + **🌟 MG 쉬지** / 지난 미완료 |

항공권·숙소 검색과 예산 환산은 **🌟 MG 쉬지 바로 아래**에 붙어 있다.
한때 `/travel` 탭으로 따로 뒀는데, 연휴를 고르는 순간이 곧 "얼마면 갈 수 있나"를 묻는
순간이라 화면을 옮길 이유가 없었다. 탭은 다시 없앴다.

1. **일정 CRUD** — 추가 / 수정 / 완료 표시 / 삭제. 팝업(`<dialog>`)으로 입력한다
2. **일정 속성** — 시작일·종료일(기간), 하루 종일 또는 시작~종료 시각, 메모, **색**
3. **달력** — 월 그리드. 공휴일과 일정을 함께 보여 주고, 여러 날에 걸친 일정은 가로 띠로 그린다.
   날짜를 누르면 오른쪽 칸이 그 날로 바뀐다. 왼쪽엔 ISO 주차, 급여일 같은 사내 고정
   마일스톤도 같이 뜬다(`lib/milestones.ts`, DB 미참조라 연차·추천 계산엔 관여하지 않는다)
4. **공휴일 보기** — 연도 단추로 그 해 월별 공휴일을 펼치고(연도 칩으로 해도 옮긴다),
   `‹ 개천절` `한글날 ›`로 앞뒤 공휴일에 바로 건너뛴다. `«`는 해, `‹`는 달 단위 이동
5. **🌟 MG 쉬지** — 고른 날이 들어가는 연휴 조합을 연차 사용일수(1·2·3일)별로 보여 준다
6. **연차 잔고** — 총 일수는 사람이 넣고, **쓴 일수는 자동으로 센다** (아래 참고)
7. **시간 겹침** — 같은 날 시각이 겹치는 일정에 표시만 한다. 저장을 막지 않는다
8. **항공권·숙소·환산** — 추천 연휴의 날짜가 채워진 검색 링크 + 환산액 한 줄

## 스택

- Next.js 16.3.4 (App Router, Turbopack, TypeScript)
- Tailwind CSS v4
- SQLite — **libSQL 클라이언트 (`@libsql/client`)**. 로컬은 `file:./data/app.db`,
  클라우드는 Turso(`libsql://...`). **같은 코드가 양쪽을 다 본다 — 주소만 다르다**
- 환율만 외부 API — `open.er-api.com` (키 불필요). 자세한 건 `lib/fx.ts`

### SQLite 드라이버 연혁 — 왜 지금 libSQL인가

세 번 바뀌었고, 매번 **환경이 막아서** 바뀌었다.

1. `better-sqlite3` — 이 환경의 npm이 install script(`node-gyp rebuild`)를 차단해
   네이티브 바이너리가 빌드되지 않았다.
2. Node 24 내장 `node:sqlite` — 네이티브 컴파일이 필요 없어 이쪽으로 갔다.
   동기 API(`DatabaseSync`)라 `await` 없이 불렀다.
3. **`@libsql/client`** (현재) — 인터넷에 올리려니 `node:sqlite`는 **로컬 파일밖에 못 본다.**
   무료 호스팅은 전부 파일 시스템이 휘발성이라(Render 무료는 디스크를 붙일 수 없다)
   일정을 저장하는 순간 날아간다. libSQL은 SQLite 방언이 그대로라 **쿼리 63개의 SQL 문장을
   거의 손대지 않고** 원격으로 넘어갈 수 있었다. 설치도 네이티브 빌드가 없다.

바뀐 대가는 하나다 — **API가 비동기다.** `lib/*.ts`의 DB 함수가 전부 `async`가 되었고
부르는 쪽(라우트 17개 + `page.tsx`)이 `await`한다. 원래도 그쪽은 모두 async였고
`getDb()`가 `lib/` 밖에는 한 곳도 없어서, 이 전환이 컴포넌트까지 번지지 않았다.

> `getDb()`는 **Promise를 캐싱한다.** 객체를 캐싱하면 초기화가 끝나기 전에 들어온
> 두 번째 요청이 마이그레이션·시드를 다시 돌린다.

## 디렉터리

```
app/
  layout.tsx                     globals.css + 첫 페인트 전에 테마를 적용하는 인라인 스크립트
  page.tsx                       대시보드 전체 — Server Component, DB를 직접 읽는다
  api/events/route.ts            GET(목록, ?date= 지원) / POST(추가)
  api/events/[id]/route.ts       PATCH(수정·완료 토글) / DELETE
  api/leave/route.ts             GET / PUT — 연차 총 일수
  api/holidays/route.ts          GET — 공휴일 **날짜만**. 팝업이 연차 일수를 세는 데 쓴다
  ../proxy.ts                    APP_PASSWORD가 있을 때만 켜지는 HTTP Basic 문 (Next 16)
  components/CalendarGrid.tsx    Server Component — 월/주 레이아웃은 서버에서, 셀만
                                  DayCellInteractive로 감싼다 (더블클릭 메모 때문)
  components/DayCellInteractive.tsx 'use client' — 셀 하나. 더블클릭 메모 팝업 + 메모 점 표시
  components/localNotes.ts       'use client' — 날짜별 한 줄 메모, localStorage (서버 미참조)
  components/ThemeToggle.tsx     'use client' — 시스템 → 라이트 → 다크 순환
  components/LeaveBudgetButton.tsx 'use client' — 연차 잔고 표시 + 총 일수 입력
  components/TripQuickLinks.tsx  'use client' — 추천 아래 항공권·숙소 링크 + 환산 한 줄
  components/leaveDays.ts        'use client' — 공휴일 캐시 + 연차 일수 계산 (클라이언트용)
  components/AddEventButton.tsx  'use client' — 추가 팝업 (네이티브 <dialog>)
  components/EventEditButton.tsx 'use client' — 수정 팝업
  components/EventFields.tsx     'use client' — 두 팝업이 공유하는 입력
  components/EventForm.tsx       'use client' — 추가 폼 본문
  components/EventList.tsx       'use client' — 목록
  components/EventItem.tsx       'use client' — 완료 토글 / 삭제 / 수정 버튼
  components/CopyWeekButton.tsx  'use client' — 고른 날이 속한 주를 업무보고 텍스트로 복사
  components/TodoList.tsx        'use client' — 서버 없는 체크리스트, localStorage
lib/
  db.ts                 getDb() — DatabaseSync 싱글턴 + 스키마 + 시드
  events.ts             쿼리 모음 (list/create/update/delete) + 입력 검증 + busyDates
  holidays.ts           공휴일 **생성기** (음력 + 대체공휴일 규칙)
  milestones.ts          사내 고정 마일스톤(급여일 등) — DB 미참조, 순수 표시 전용
  calendar.ts           공휴일 DB 조회 + 월 그리드 구성 + 인접 공휴일
  bridge.ts             연휴 후보 생성 (collectCandidates) — 정렬은 하지 않는다
  trips.ts              길이를 정해 두고 시기를 찾는다 (bridge와 방향이 반대)
  leave.ts              연차 잔고 — 총 일수 저장 + 쓴 일수 집계(주말·공휴일 제외)
  fx.ts                 환율 — 하루 한 번 외부에서 받아 DB에 캐시
  eventColors.ts        일정 색 팔레트 (DB를 import하지 않는다)
  currencies.ts         환산할 통화 목록 (DB를 import하지 않는다)
  flights.ts            항공권 **검색 링크**만 만든다. 가격은 가져오지 않는다
  date.ts               YYYY-MM-DD 문자열 유틸 + 월 단위 헬퍼 + 시각(HH:MM) 유틸
data/app.db             SQLite 파일 (gitignore, 첫 실행 시 자동 생성·시드)
```

공휴일 **조회**가 `holidays.ts`가 아니라 `calendar.ts`에 있는 이유: `db.ts`가 시드하려고
`holidays.ts`를 import하므로, 조회 함수를 `holidays.ts`에 두면 순환 참조가 된다.
`holidays.ts`는 생성기로만 남겨 두고 DB 조회는 `calendar.ts`가 맡는다.

화면 상태(`month` `date` `lv` `hl`)는 전부 **URL 쿼리스트링**에 있다.
그래서 날짜 셀·월 이동·공휴일 탐색·연차 수 선택이 모두 `<Link>`이다. 달력 레이아웃 자체엔
클라이언트 JS가 없고, 셀 더블클릭 메모(`DayCellInteractive`)만 예외로 얇게 걸려 있다.
연도 접기는 URL도 쓰지 않는다 — 브라우저 기본 `<details>`다.

## 규칙

- **날짜는 전부 `YYYY-MM-DD` 문자열**로 다룬다. `Date` 객체를 DB나 API 경계로 넘기지 않는다.
  타임존 때문에 하루 밀리는 사고를 막기 위한 것이므로 예외를 두지 말 것.
- DB 접근은 `lib/db.ts`의 헬퍼 `all` / `get` / `run` / `batch`만 통한다.
  다른 파일에서 `createClient(...)` 금지 — dev 서버 HMR 때 커넥션이 중복 생성되지 않도록
  `globalThis`에 Promise로 캐싱해 둔 싱글턴이다.
- 쿼리는 항상 `all(sql, [값...])`처럼 **바인딩 파라미터**를 쓴다. 문자열 결합 금지.
- **여러 행을 쓸 때는 `batch()`로 묶는다.** 원격 DB에서는 왕복 횟수가 곧 속도다 —
  공휴일 120행·반복 일정 60회차를 하나씩 `await`하면 그만큼 왕복이 직렬로 쌓인다.
  트랜잭션이라 중간에 끊겨도 반쯤 쓰인 상태가 남지 않는다.
- `lastInsertRowid`는 libSQL이 **bigint**로 준다. `run()`이 number로 바꿔 돌려주므로
  그걸 쓴다 — 날것으로 JSON에 넣으면 "Do not know how to serialize a BigInt"로 터진다.
- ⚠️ **`NextResponse.json()`은 `any`를 받아서 `await` 누락이 타입 검사에 안 걸린다.**
  `json({ events: listEvents() })`처럼 쓰면 빈 `{}`가 나가고 조용히 틀린다.
- Route Handler의 `params`는 **Promise**다. `const { id } = await ctx.params`.
- 서버 상태를 바꾼 뒤 클라이언트는 `router.refresh()`로 Server Component를 다시 그린다.
  로컬 state로 낙관적 업데이트를 흉내 내지 않는다 (DB가 단일 진실 공급원).
- **클라이언트 컴포넌트에서 `lib/events.ts`의 런타임 값을 import하지 말 것.**
  타입만 가져온다. 함수를 하나라도 가져오면 `@libsql/client`가 클라이언트 번들로 끌려와
  빌드가 깨진다 (예전에는 `node:sqlite`가 끌려왔다. 드라이버가 바뀌어도 규칙은 그대로다).
  색 팔레트를 `lib/eventColors.ts`로 따로 뺀 이유가 이것이다.
- 색은 Tailwind 클래스가 아니라 **hex + inline style**로 준다. `bg-${color}`처럼 클래스명을
  문자열로 조립하면 Tailwind가 빌드 때 그 클래스를 못 찾아 스타일이 통째로 빠진다.

## 일정 스키마

```sql
events (
  id, title,
  date       TEXT NOT NULL,   -- 시작일
  end_date   TEXT NOT NULL,   -- 종료일. 하루짜리면 시작일과 같다 (NULL을 두지 않는다)
  start_time TEXT,            -- NULL이면 하루 종일
  end_time   TEXT,            -- 시작 시각이 있을 때만 의미가 있다
  is_leave   INTEGER NOT NULL DEFAULT 0,  -- 연차를 쓰는 일정인가
  leave_days REAL,            -- NULL이면 '자동'. 반차/반반차만 숫자가 들어간다
  memo, done, color, series_id, created_at
)
```

`end_date`에 NULL을 두지 않는 이유: `date <= d AND end_date >= d` **한 조건으로**
"그 날에 걸쳐 있는 일정" 조회가 끝난다. 하루짜리도 예외가 없다.

나중에 붙인 열(`end_date` `color` `end_time`)은 `CREATE TABLE IF NOT EXISTS`가
기존 표를 건드리지 않으므로 `PRAGMA table_info`로 확인 후 `ALTER TABLE`한다.

동작상 정한 것 셋:

- 시작일만 옮기면 **기간(일수)을 유지한 채** 종료일도 같이 민다. 안 그러면 3일짜리 일정을
  하루 미룰 때 종료일이 시작일보다 빨라진다.
- `is_leave`를 끄면 `leave_days`도 같이 비운다. 안 그러면 연차가 아닌 일정에 숫자만 남아
  잔고에 섞인다 (시작 시각을 지울 때 종료 시각을 같이 지우는 것과 같은 이유).
- 시작 시각을 지우면(= 하루 종일) **종료 시각도 같이 지운다.** 안 그러면 "끝나는 시각만
  있는 하루 종일 일정"이 남는다.

## 공휴일 데이터 (`lib/holidays.ts`)

하드코딩 목록이 아니라 **규칙으로 생성**한다. `db.ts`가 시드할 때 올해부터 5년치를 만든다.

- 양력 고정 공휴일 8개는 그대로 찍는다.
- 음력 공휴일(설날·추석·부처님오신날)은 Node ICU에 들어 있는 **단기력**을
  `Intl.DateTimeFormat('en-u-ca-dangi')`로 읽어 양력 날짜를 역산한다.
  외부 API도, 음력 변환표를 손으로 박는 일도 필요 없다.
- 대체공휴일은 「관공서의 공휴일에 관한 규정」 제3조를 코드로 옮겼다.
  대상 제외는 **신정과 현충일**. 설날·추석 연휴는 **일요일**(과 다른 공휴일)과 겹칠 때만이며
  토요일은 공휴일이 아니라서 대체 사유가 되지 않는다.

시드는 `DELETE` 후 다시 넣는다(UPSERT 아님). 규칙을 고쳤을 때 예전에 잘못 들어간 행이
남지 않게 하기 위해서다. 다만 **커넥션마다 돌지는 않는다** — `meta` 표의
`holidays_seed` 값(`판번호:시작연도-끝연도`)이 지금과 다를 때만 갈아 끼운다.
서버리스에서는 콜드 스타트마다 이 함수가 도는데, 그때마다 120행을 지우고 다시 쓰면
왕복도 비싸고 쓰기 할당량도 아깝다.

⚠️ **그래서 규칙을 고치면 `lib/db.ts`의 `HOLIDAY_SEED_VERSION`을 올려야 한다.**
안 올리면 이미 시드된 DB에는 새 규칙이 반영되지 않는다. 로컬은 `data/`를 지워도 된다.
(그리고 커넥션이 `globalThis`에 캐싱되므로 dev 서버 재시작도 필요하다 — HMR로는 안 돈다.)

> 하드코딩 시절 데이터에 오류가 3건 있었고 생성기로 바꾸면서 바로잡혔다:
> 2026년 추석 대체공휴일(연휴가 목·금·토라 대체 없음), 2027년 현충일 대체공휴일(대상 아님),
> 2027년 설날 날짜(2/6 → 2/7).

⚠️ **선거일과 임시공휴일은 규칙으로 만들 수 없다.** 확정되는 대로 `MANUAL_HOLIDAYS`에
손으로 넣을 것. 현재 2026-06-03 지방선거일만 들어 있다.

## 징검다리 알고리즘 (`lib/bridge.ts`)

1. 대상 기간의 모든 날을 "쉬는 날(주말+공휴일)" / "일하는 날"로 표시
2. 누적합으로 임의 구간의 평일 개수 = 그 구간을 통째로 쉬는 데 필요한 연차 수를 O(1)에 구한다
3. **더 이상 늘릴 수 없는 연휴 구간**을 모두 만든다 — 구간 `[s..e]`의 바로 앞뒤(`s-1`, `e+1`)가
   "연차로 쓰지 않는 평일"이면 그 구간이 곧 하나의 연휴다. 이 조건만으로 구간이 유일하게
   정해져서 중복 제거가 따로 필요 없다
4. 3일 이상이고 **공휴일을 하나 이상 포함**하며, **연차로 쓸 날에 일정이 없는** 것만 남긴다

**정렬과 추리기는 이 파일이 하지 않는다.** 화면마다 기준이 달라 부르는 쪽이 정한다.

### 설계에서 바뀐 점 (원래 계획과 다름)

- 원래 계획은 "양 끝이 쉬는 날인 구간"만 후보로 삼았는데, 그러면 **금요일 공휴일 뒤에 월요일
  연차를 붙이는 가장 흔한 샌드위치 패턴**이 통째로 빠진다(구간의 끝이 연차라서). 3번의 조건으로
  일반화하니 기존 후보를 모두 포함하면서 이 경우까지 잡힌다.
- **공휴일을 하나 이상 포함**해야 한다는 조건이 없으면 "금요일에 연차 쓰면 3일 쉼"(효율 3.0)이
  연 50건 넘게 나와 목록을 도배한다. 누구나 아는 값이라 추천으로서 정보량이 없다.

### 화면에서 추리는 방법 (`app/page.tsx`)

고른 날이 **구간에 들어가는** 후보만 남기고, 연차 사용일수(1·2·3일)로 나눠 보여 준다.
공휴일이 아닌 평일을 골라도 나온다.

연차 상한을 3일로 둔 이유: 4일 넘게 몰아 쓰는 건 징검다리가 아니라 그냥 장기 휴가다.

**공휴일이 없는 주에는 `includeHolidayFree: true`로 한 번 더 부른다.**
5월·11월처럼 공휴일이 통째로 비는 달이 있는데, 그때 아무것도 안 그리면
"이 날 연차 쓰면 어떻게 되나"라는 질문 자체에 답을 못 한다.
`bridge.ts`가 공휴일 없는 구간을 기본으로 빼는 이유는 **목록을 도배하기 때문**인데,
여기서는 고른 날이 들어가는 것만 남겨 몇 줄 안 되므로 그 걱정이 적용되지 않는다.
다만 그건 황금연휴가 아니라 그냥 주말 늘리기라 **제목을 `연차 쓰면`으로 바꿔** 단다.

그래도 비는 경우는 둘뿐이다 — **지난 날짜**이거나, **그 날에 하루 종일 일정이 있어서**다.
뒤엣것은 화면에 드러나지 않는 규칙이라 한 줄로 적어 준다("연차 추천에서 빼 두었습니다").

> 한때 "성립하는 조합 전부"를 늘어놓았더니 공휴일 하나에 20가지가 나왔다. 대부분은
> "같은 연차를 쓰고 더 짧게 쉬는" 열등한 조합이라, 연차 수로 나누고 그 안에서만 고르게 했다.

### 등록된 일정과의 충돌 (`busyDates`)

`lib/events.ts`의 `busyDates(from, to)`가 **연차를 낼 수 없는 날짜**를 주고,
`collectCandidates`가 그 날을 **연차로 써야만 성립하는 후보를 통째로 버린다.**
기간 일정이면 그 사이 날이 전부 막힌다.

막는 것은 **단발로 잡힌 하루 종일 일정**뿐이다. 셋을 뺀다:

- **완료한 일정** — 이미 끝난 일이다.
- **시각이 있는 일정** — 10~11시 회의 하나 때문에 그 날 연차를 못 낼 이유가 없다. 옮기면 그만이다.
- **반복 일정(`series_id`가 있는 것)** — 매주 회의를 넣으면 60주치 월요일이 전부 막혀
  월요일이 필요한 추천이 통째로 사라진다. 실측으로 추천이 **86건 → 56건**으로 줄었다.
  주간 회의 때문에 연차를 못 낸다는 건 사실이 아니다.

쉬는 날 쪽에 일정이 걸린 건 막지 않는다. 그건 옮기면 그만이지만, 연차는 그 날 일이 있으면
애초에 못 내기 때문이다.

화면에는 이 규칙을 **표시하지 않는다.** 켜고 끄는 토글도, 설명 한 줄도 두지 않는다 —
토글은 문구가 불친절한 데다 실제 데이터에서 차이를 만드는 일이 드물어 혼란만 줬다.
대신 규칙이 안 보이는 만큼 여기 문서에 남긴다. API에서는 `?avoidBusy=0`으로 끌 수 있다.

## 연차 잔고 (`lib/leave.ts`)

총 일수만 사람이 넣는다(`leave_budget`). 회사·근속연수마다 달라 규칙으로 만들 수 없다.

**쓴 일수는 저장하지 않는다.** `is_leave = 1`인 일정을 읽을 때마다 세는데,
`leave_days`가 NULL이면 **기간에서 주말과 공휴일을 뺀 날수**를 쓴다.
금~월을 쉬어도 연차는 이틀이므로 기간 일수를 그대로 세면 잔고가 실제보다 빨리 준다.

저장하지 않는 이유: 일정을 하루 미루면 그 수가 달라진다. 저장해 두면 옛 숫자가 남는다.
반차(0.5)·반반차(0.25)처럼 자동값과 다를 때만 `leave_days`에 숫자를 넣는다 (0.25 단위).

같은 규칙이 **두 군데** 있다 — 서버는 `lib/leave.ts`, 팝업·목록 미리보기는
`app/components/leaveDays.ts`. 클라이언트에서 `lib/leave.ts`를 import하면 `node:sqlite`가
번들로 끌려오기 때문이다. **한쪽을 고치면 다른 쪽도 같이 고칠 것.**

## 시간 겹침

`timeConflictIds(events)` — 이미 읽어 둔 그 날 일정 배열만 훑는다(DB 재조회 없음).
같은 날 시각이 겹치면 목록에 표시만 하고 **저장은 막지 않는다.** 하루에 두 곳을 잡아야 하는
날이 실제로 있다. 끝과 시작이 맞닿는 것(10~11시, 11~12시)은 겹침이 아니다.
하루 종일 일정은 시간 칸을 차지하지 않아 대상이 아니고, 완료한 일정도 뺀다.

## 여행 준비 (`/travel`)

- **환율**: `open.er-api.com` — 키가 필요 없고 통화가 166종이다. ECB 기반(frankfurter 등)은
  베트남 동·태국 바트가 없어 정작 자주 가는 곳이 빠진다. `fx_rates`에 **하루 한 행씩** 캐시하고,
  못 받으면 마지막 값을 `stale`로 표시해 보여 준다. 환율 때문에 화면이 500이 되면 안 된다.
- **항공권**: 가격을 가져오지 않는다. 무료로 쓸 수 있는 가격 API가 사실상 없다 —
  스카이스캐너·Kiwi는 파트너 승인, 구글 플라이트는 공개 API 없음, Amadeus 무료 티어는
  키·쿼터에 테스트 데이터가 실제와 다르다. 대신 앱이 이미 아는 **출발·귀국일을 채운 검색 주소**를
  만들어 넘긴다 (`lib/flights.ts`). 키도 쿼터도 없고 가격은 항상 최신이다.
- **둘은 도착지 선택을 공유한다** (`TravelPanels`). 도쿄행을 고르면 아래 환산에서 엔화 카드가
  맨 앞으로 올라오고 `도착지` 표시가 붙는다. 표시만 하고 자리를 그대로 두면 통화 열세 칸 중에서
  눈으로 찾아야 하고, 목록이 길어지면 화면 밖으로 밀려난다.
  그래서 `DESTINATIONS`의 `currency`는 **반드시 `FX_CURRENCIES`에 있어야 한다.**

## 실행

```bash
npm run dev                 # 개발 서버 — http://localhost:3000
npm run build && npm start  # 프로덕션 모드 (start는 build가 선행돼야 한다)
```

`@types/node`는 **^24**로 올려 두었다. `node:sqlite` 시절에는 ^20에 타입 선언이 없어
`tsc`가 TS2307로 실패했기 때문인데, libSQL로 옮긴 뒤에도 그대로 둔다 —
`package.json`의 `engines`가 Node 24를 요구하므로 타입도 맞춰 두는 편이 맞다.

DB를 초기화하려면 `data/` 폴더를 지우고 다시 띄우면 된다.
클라우드(Turso)를 쓰는 중이면 `TURSO_DATABASE_URL`이 가리키는 DB를 지워야 한다 —
로컬 파일을 지워도 그쪽은 그대로다.

> dev 서버에서 `lib/*.ts`에 **새 export를 추가하면** Turbopack이 못 잡고
> `X is not a function` 500이 나는 일이 있다. `next.config.ts`를 touch하면 재로드된다.

## 데스크톱 빌드 (Tauri) — `src-tauri/`

```bash
npm run tauri:dev     # 개발 — devUrl(localhost:3000)을 그대로 띄운다
npm run tauri:build   # 배포 — npm run package(정적 산출물) 후 cargo/NSIS로 설치 파일까지
```

버전은 `package.json` · `src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` **세 군데**에
동일하게 적는다. **SemVer(`MAJOR.MINOR.PATCH`) 세 자리를 꼭 지킨다** — `1.0`처럼 두 자리로
적으면 `npm`/`cargo` 둘 다 정식 형식이 아니다. 버그만 고쳤으면 PATCH(`1.0.0→1.0.1`),
기능이 추가됐으면 MINOR(`1.0.0→1.1.0`)를 올린다. 버전을 안 올리고 다시 빌드하면
설치 파일 이름이 겹쳐서 **어느 빌드가 최신인지 파일명만 보고 구분이 안 된다** — 실제로
이것 때문에 "고쳤다는 버그가 여전하다"는 혼선이 한 번 있었다(아래 항목 참고).

### ⚠️ `capabilities/*.json`에 `remote.urls`가 없으면 배포본에서 모든 커맨드가 막힌다

배포본은 `lib.rs`가 사이드카 서버(`http://127.0.0.1:3210`)를 `WebviewUrl::External`로
**직접** 연다 — `frontendDist`(정적 파일)나 `tauri://` 프로토콜을 안 쓴다. Tauri ACL은
`devUrl`/`frontendDist`에 안 맞는 출처를 전부 **"원격(remote)"**으로 분류하는데,
capability의 `remote` 필드가 비어 있으면(기본값) 그 capability에 적힌 권한이
**원격 출처에는 통째로 적용되지 않는다.** 명령어 하나하나가 아니라 **파일 전체**가
무시되는 것이라, `core:default`까지 포함해 등록된 모든 커맨드가
`Command X not allowed by ACL`로 막힌다.

`dev` 모드(`devUrl=http://localhost:3000`)는 이 조건에 안 걸려 로컬로 잡히므로
**`npm run tauri:dev`로만 검증하면 이 문제가 절대 안 보인다** — 반드시 `tauri:build`로
설치 파일을 뽑아 실제로 실행해서 확인해야 한다. 고치는 법은
`src-tauri/capabilities/default.json`에 사이드카 주소를 명시하는 것뿐이다:

```json
"remote": { "urls": ["http://127.0.0.1:3210/*"] }
```

## 배포 (Fly.io) — `Dockerfile` · `fly.toml` · `proxy.ts`

폴더 복사(`npm run package`)와 **인터넷 호스팅** 두 길이 있고, 후자가 이 셋이다.

- **`proxy.ts`** — Next 16에서 `middleware.ts`는 deprecated이고 이름이 `proxy.ts`로
  바뀌었다 (런타임은 Node). `APP_PASSWORD`가 있을 때만 켜지는 HTTP Basic 문이다.
  이 앱에는 로그인이 없어서, 인터넷에 올리는 순간 "접속한 사람이 곧 주인"이라는 전제가 깨진다.
  `matcher`를 **일부러 두지 않았다** — `_next/static`을 열어 두면 화면은 못 봐도
  번들이 통째로 내려간다. Basic 인증은 브라우저가 하위 요청에 헤더를 자동으로 붙여 준다.
- **머신은 하나여야 한다.** DB가 SQLite 파일 하나이고 볼륨은 머신 하나에만 붙는다.
  `fly deploy --ha=false`. 늘리려면 SQLite를 먼저 갈아야 한다.
- **헬스체크를 붙이지 않았다.** `APP_PASSWORD`가 켜지면 `/`가 401이라, 200 기대 체크를
  달면 재시작 루프에 빠진다.
- **이미지에서는 리눅스로 `npm ci`를 다시 돌린다.** Claude Code 실행 파일이 플랫폼별
  optional dependency로 들어와서 윈도우에서는 `claude.exe`다. 그리고 alpine이 아니라
  `node:24-slim`(glibc)을 쓴다 — 그 패키지가 glibc/musl로 갈려 있다.

### 챗봇은 배포본에서 기본으로 빠진다

실행 파일 하나가 **215MB**이고(`manifest.json`), 자식 프로세스로 뜨느라 RAM을 요구해
VM을 1GB로 올려야 하며, `ANTHROPIC_API_KEY`를 서버에 둬야 해서 **요금이 그 계정에 붙는다.**
잃는 것은 작다 — `OmniSearch`의 기본 경로는 `/api/events?q=` 검색이고 챗봇은 팝업에서
한 번 더 눌러야 도는 보조 경로다.

스위치가 **두 군데**라 짝을 맞춰야 한다:

| 자리 | 하는 일 |
| --- | --- |
| `Dockerfile`의 `WITH_CHAT` | 플랫폼 패키지(=바이너리)를 이미지에 담을지 |
| `CHAT_DISABLED` (`lib/settings.ts`) | 서버·화면이 챗봇을 없는 것으로 볼지 |

기본값은 담지 않고(`WITH_CHAT=0`) 그 스테이지가 `ENV CHAT_DISABLED=1`을 박아 둔다.
**담았는데 `CHAT_DISABLED=1`이 남아 있으면 켜지지 않고, 안 담았는데 지우면 500이 난다.**

`CHAT_DISABLED`를 오프라인 모드와 따로 둔 이유: 오프라인은 밖으로 나가는 것 전부
(항공권·숙소·환율·구글)를 같이 끈다. 호스팅한 배포본은 그것들은 쓰고 챗봇만 빼고 싶다.
그리고 DB가 아니라 **환경변수**인 이유는, 이건 취향이 아니라 **그 배포본의 성질**이기
때문이다 — 바이너리가 없는 이미지에서 화면 토글로 켜면 켜자마자 고장 난다.

Next의 standalone 추적은 `@anthropic-ai/claude-agent-sdk`만 넣고 **플랫폼 패키지를
빼먹는다**(spawn이라 정적 분석에 안 걸린다). 그래서 `WITH_CHAT=1` 스테이지가
`@anthropic-ai` 스코프를 통째로 덮어쓴다.

## 지울 것

아무 데서도 import하지 않는데 삭제 권한이 없어 남아 있는 파일들:

삭제 권한이 없어 **이름 뒤에 `.removed`를 붙여** 놓았다. `.gitignore`와 `tsconfig.json`이
`*.removed`를 걸러서 빌드·Tailwind 스캔에서 빠진다. 권한이 생기면 통째로 지우면 된다.

```bash
find . -name '*.removed' -not -path './node_modules/*' -exec rm -rf {} +
```

| 대상 | 왜 내렸나 |
| --- | --- |
| `lib/plan.ts` · `app/api/.plan.removed` | 연차 예산 배분 DP. 화면에서 내렸다 |
| `app/api/.bridge.removed` | 알고리즘 확인용 디버그 라우트 |
| `app/.calendar.removed` | 예전 `/calendar` redirect. 로컬 앱이라 북마크한 사람이 없다 |
| `app/components/WeekGrid.tsx` | 주간 시간축. 아래 참고 |
| `app/components/TripFinderButton.tsx` | `/travel`의 항공권 목록과 하는 일이 같아 중복이었다 |
| `app/components/holidayDates.ts` | `leaveDays.ts`로 합치면서 미사용 |

> `app/components/NavTabs.tsx`는 여행 준비 탭이 생기면서 **다시 쓰고 있다.** 지우지 말 것.

### 주간 뷰를 내린 이유

시각(`start_time`)을 저장만 하고 볼 데가 없어서 만들었는데, 실사용자가 직장인이라
**시각이 붙는 일정 자체가 드물다.** 회사 일정은 아웃룩·구글에 있고 이 앱에 들어오는 것은
개인 일정과 연차다. 결국 대부분의 주에서 텅 빈 시간축이 화면을 밀어냈다.

시각 정보가 아주 안 보이는 것은 아니다 — 목록에 `14:00~16:00`으로 적히고,
겹치면 `시간 겹침`으로 알려 준다. 그 정도면 충분했다.

---

- 모든 답변의 문장 끝을 "선생님"으로 맺는다.
