"use client";

/**
 * 서버 렌더가 터졌을 때 나오는 화면.
 *
 * 이 파일이 없으면 Next 기본 오류 화면이 뜨는데, 거기서는 **돌아갈 길이 없다** —
 * 주소가 이상한 값이면 새로고침해도 같은 오류가 반복된다.
 * 대시보드는 요청마다 DB를 열댓 번 읽으므로 그중 하나만 실패해도 여기로 온다.
 *
 * 그래서 두 가지 길을 둔다: 그 자리에서 다시 그려 보기(reset), 그리고 **깨끗한 주소로 나가기**.
 * 뒤엣것이 실제로 중요하다 — 오류의 흔한 원인이 주소에 붙은 이상한 값이기 때문이다.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-lg font-bold">화면을 그리지 못했습니다</h1>
      <p className="text-sm leading-relaxed text-muted">
        저장된 일정은 그대로 있습니다. 아래에서 다시 시도하거나 달력 처음으로 돌아가 주세요.
      </p>

      {/* 개발 중에 원인을 못 보면 고칠 수가 없다. 사용자에게도 붙여 넣을 문장은 있어야 한다 */}
      {error?.message && (
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 text-left text-[11px] text-muted">
          {error.message}
        </pre>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
        >
          다시 시도
        </button>
        {/* 오류의 흔한 원인이 주소에 붙은 이상한 값이라, 쿼리 없는 '/'로 보낸다.
            window.location을 쓰는 이유: 클라이언트 라우터 상태까지 버리고 통째로 다시 연다.
            (Link로 이동하면 망가진 렌더 트리를 그대로 안고 간다) */}
        <button
          type="button"
          onClick={() => {
            // router.push는 망가진 렌더 트리를 안고 이동한다. 여기서는 통째로 다시 여는 것이 맞다.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/";
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent"
        >
          달력 처음으로
        </button>
      </div>
    </main>
  );
}
