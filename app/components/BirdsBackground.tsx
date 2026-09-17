"use client";

import { useSyncExternalStore } from "react";
import { readBirdsBg, subscribeBirdsBg } from "./birdsBg";

/**
 * '?' 버튼 꾹 누르기로 켜는 이스터에그 배경.
 *
 * 달력·목록 등 화면 내용 **뒤**에 깔려야 해서 `position: fixed` + **음수**
 * z-index(`-z-10`)로 둔다. `z-0`(= z-index: auto/0)으로 뒀더니 오히려 본문 위에
 * 그려져 달력이 다 가려 보이는 문제가 있었다 — CSS 칠하는 순서가
 * "위치 없는 일반 흐름 콘텐츠" → "z-index 0인 위치 지정 요소" 순이라, 위치
 * 지정 요소는 z-index가 0이어도 일반 흐름 콘텐츠보다 나중에(=위에) 칠해진다.
 * 진짜로 뒤에 두려면 **음수** z-index를 줘서 그보다 앞선 단계에서 칠하게
 * 해야 한다. `pointer-events: none`이라 화면 조작을 막지 않는다.
 *
 * 흐림(blur)을 넣었더니 너무 흐릿해서 안 보인다는 피드백을 받아 뺐다 — 불투명도
 * (0.7)만으로 존재감을 조절한다. 꺼질 때도 뚝 끊기지 않도록 opacity만 트랜지션한다
 * (마운트/언마운트가 아니라).
 *
 * 이미지 한 장(`easter-egg-birds.png`)을 **화면 전체**를 덮게 깐다.
 * 이미지 자체가 이미 왼쪽·오른쪽에 캐릭터, 가운데가 비어 있는 구도라 —
 * 두 번 복제해서 모서리마다 따로 두면 같은 가족이 두 번 나오는 것처럼
 * 보이므로 한 장만 쓰고, `object-cover`로 화면을 가득 채운다.
 */
export default function BirdsBackground() {
  const on = useSyncExternalStore(subscribeBirdsBg, readBirdsBg, () => false);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden transition-opacity duration-700 ease-out"
      style={{ opacity: on ? 0.7 : 0 }}
    >
      <img
        src="/easter-egg-birds.png"
        alt=""
        className="h-full w-full object-cover"
      />
    </div>
  );
}
