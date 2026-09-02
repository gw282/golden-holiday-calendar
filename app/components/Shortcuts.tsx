"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 새 일정 팝업 버튼을 찾을 때 쓰는 id. AddEventButton과 맞춰 둔다. */
export const ADD_EVENT_BUTTON_ID = "add-event-button";

/** 검색 입력창을 찾을 때 쓰는 id. SearchBox와 맞춰 둔다. */
export const SEARCH_INPUT_ID = "search-input";

/**
 * 키보드 단축키. 화면을 그리지 않고 이벤트만 듣는다.
 *
 * 이동은 전부 URL이라 `router.push`만 하면 되고, 새 일정은 팝업을 가진 컴포넌트가
 * 따로 있어서 그 버튼을 눌러 준다 — 상태를 위로 끌어올리는 것보다 이쪽이 짧다.
 */
export default function Shortcuts({
  prevHref,
  nextHref,
  todayHref,
}: {
  prevHref: string;
  nextHref: string;
  todayHref: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // 조합키는 브라우저 몫이다
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // 팝업(<dialog>)이 열려 있으면 손대지 않는다.
      // ESC로 닫는 것은 showModal()의 기본 동작이라 여기서 또 처리하면 두 번 닫힌다.
      if (document.querySelector("dialog[open]")) return;

      // 연도 브리핑은 <dialog>가 아니라 <details>라 ESC가 안 먹는다. 그것만 여기서 닫아 준다.
      // 입력 중인지 따지지 않는 이유: 펼친 것을 닫는 건 글을 쓰다가도 하고 싶은 일이다.
      if (e.key === "Escape") {
        const open = document.querySelectorAll<HTMLDetailsElement>("details[open]");
        if (open.length === 0) return;
        open.forEach((d) => d.removeAttribute("open"));
        e.preventDefault();
        return;
      }

      // 글을 쓰는 중이면 끼어들지 않는다
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (typing) return;

      switch (e.key) {
        case "ArrowLeft":
          router.push(prevHref, { scroll: false });
          break;
        case "ArrowRight":
          router.push(nextHref, { scroll: false });
          break;
        case "t":
        case "T":
          router.push(todayHref, { scroll: false });
          break;
        case "n":
        case "N":
          document.getElementById(ADD_EVENT_BUTTON_ID)?.click();
          break;
        // 검색창으로 건너간다. 브라우저·에디터가 공통으로 쓰는 관습이라 설명이 필요 없다.
        // 위의 typing 가드 덕에 글을 쓰는 중에는 여기까지 오지 않는다 — 메모에 '/'를 넣을 수 있다.
        case "/": {
          const input = document.getElementById(SEARCH_INPUT_ID);
          if (!(input instanceof HTMLInputElement)) return;
          input.focus();
          input.select();
          break;
        }
        default:
          return;
      }

      e.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, prevHref, nextHref, todayHref]);

  return null;
}
