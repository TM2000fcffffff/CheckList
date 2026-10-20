# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

"그거 언제 했더라?" — 가끔 하는 일을 마지막으로 한 날부터 며칠 지났는지 보여 주는 모바일 중심 기록장. 요구사항은 `PRD.md`가 기준이며, 기능을 추가하면 PRD의 기능 표도 함께 갱신합니다.

## 실행·배포

- 빌드, 패키지 매니저, 테스트 도구 없음. HTML/CSS/Vanilla JS만 사용합니다(프레임워크·라이브러리 추가 금지).
- 반드시 HTTP 서버로 열어서 확인합니다. `file://`로 열면(미리보기 창에서는 `data:` URL로 바뀜) `localStorage`가 막혀 저장 기능을 확인할 수 없습니다.
- 동작 확인은 브라우저에서 직접 클릭하거나 DOM을 조작하는 방식으로 하고, 휴대폰 화면(375px)에서도 확인합니다.
- 배포는 GitHub Pages(`main` 브랜치, `/` 루트) → https://tm2000fcffffff.github.io/CheckList/ 입니다. 하위 경로에 배포되므로 리소스 경로는 항상 상대 경로로 씁니다.

## 구조

- `index.html`에서 일반 `<script>`(모듈 아님)를 `date-utils.js` → `storage.js` → `script.js` 순서로 불러옵니다. 세 파일은 전역 스코프를 공유하므로 이 순서에 의존합니다.
  - `date-utils.js`: 날짜는 모두 기기 현지 기준 `YYYY-MM-DD` 문자열로 다룹니다. 문자열 비교로 날짜 순서를 비교합니다.
  - `storage.js`: `localStorage` 키는 `when-did-i:items`, `when-did-i:sort`입니다. 불러올 때 `sanitizeItem`으로 형태를 정리하므로, 데이터 필드를 바꾸면 여기도 함께 수정합니다.
  - `script.js`: 상태(`items`)를 바꾼 뒤 `persist()` → `render()` 순서로 호출합니다. `render()`는 목록 보기와(달력 보기 중이면) 달력까지 다시 그립니다.
- 항목 데이터: `{ id, name, icon, cycleDays|null, history: string[], createdAt }`. `history`는 최신 날짜가 앞에 오고, `history[0]`이 마지막으로 한 날입니다. 날짜를 추가하거나 바꿀 때는 항상 `normalizeHistory()`로 중복을 없애고 정렬합니다.
- 상태 단계: `경과일 ÷ cycleDays`가 0.7 미만이면 ok, 0.7 이상 1 미만이면 soon, 1 이상이면 over, 주기가 없으면 none. 카드에 `level-*` 클래스로 표시합니다.
- 화면 요소는 `textContent`와 `<template>`으로 만듭니다. 사용자가 입력한 내용을 `innerHTML`에 넣지 않습니다.

## 주의할 점

- `alert`/`confirm`/`prompt`를 쓰지 않습니다. 미리보기 브라우저나 일부 인앱 브라우저에서 막혀 `confirm()`이 항상 `false`를 돌려줍니다. 위험한 동작은 화면 안에서 확인받습니다(예: 삭제 버튼을 두 번 누르기 + 토스트에서 되돌리기).
- Emoji 13 이상(🪥, 🪴 등)은 Windows 10에서 네모(□)로 깨집니다. 아이콘을 추가할 때 주의하고, 바꾼 아이콘은 `storage.js`의 `ICON_FALLBACK`에 등록합니다.
- 색상은 `style.css` `:root`의 CSS 변수로만 지정하고, `prefers-color-scheme: dark`에서도 같은 변수를 다시 정의합니다.
- 버튼에는 `white-space: nowrap`을 적용하고, 터치 영역은 최소 44px로 유지합니다.
- `<dialog>`는 열려 있을 때 `showModal()`을 다시 부르면 오류가 납니다. 배경을 눌러 닫을 때는 좌표로 판단합니다(`event.target`만 보면 안쪽 여백을 눌러도 닫힘).
- 코드 주석과 커밋 메시지는 한국어로 씁니다.
- Windows PowerShell 5.1에서 `git commit -m`에 큰따옴표가 들어가면 인자가 깨집니다. 메시지를 파일로 저장해 `git commit -F <파일>`로 커밋하거나 Bash를 사용합니다.
