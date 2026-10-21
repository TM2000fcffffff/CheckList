# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

"그거 언제 했더라?" — 가끔 하는 일을 마지막으로 한 날부터 며칠 지났는지 보여 주는 모바일 중심 기록장. 요구사항은 `PRD.md`가 기준이며, 기능을 추가하면 PRD의 기능 표도 함께 갱신합니다.

## 실행·배포

- 빌드, 패키지 매니저, 테스트 도구 없음. HTML/CSS/Vanilla JS만 사용합니다. 외부 라이브러리는 CDN으로 불러오는 `@supabase/supabase-js`(UMD, 버전 고정) 하나뿐이며, 그 밖의 프레임워크·라이브러리는 추가하지 않습니다.
- 반드시 HTTP 서버로 열어서 확인합니다. `file://`로 열면(미리보기 창에서는 `data:` URL로 바뀜) `localStorage`가 막혀 저장 기능을 확인할 수 없습니다.
- 동작 확인은 브라우저에서 직접 클릭하거나 DOM을 조작하는 방식으로 하고, 휴대폰 화면(375px)에서도 확인합니다.
- 배포: `main`에 푸시하면 Vercel(https://checklist-five-pi.vercel.app, 프로젝트 `checklist`)에 자동으로 배포됩니다. GitHub Pages(https://tm2000fcffffff.github.io/CheckList/)는 2026-10-21 기준 저장소 설정에서 꺼져 있습니다(다시 켤 수 있으니 리소스 경로는 계속 상대 경로로 씁니다).
- 이 PC에는 Python·Node·`gh`가 없습니다. 로컬 서버는 `.claude/launch.json`의 `static`(PowerShell, 포트 5713)을 쓰고, GitHub 저장소 상태는 브라우저에서 `api.github.com/repos/TM2000fcffffff/CheckList`로 확인합니다.
- 로컬과 배포 사이트는 같은 Supabase를 씁니다. 로그인 상태에서 테스트하면 사용자의 실제 기록이 바뀌므로, 테스트용 항목·그룹을 새로 만들어 확인하고 끝나면 지웁니다(기존 항목은 건드리지 않음).
- 배포 확인: 푸시하고 10~20초 뒤 배포 사이트에서 새로 추가한 전역 함수가 있는지(`typeof 함수명`) 보고 새 버전이 반영됐는지 판단합니다.

## 테스트 방법

- 파일 업로드는 `DataTransfer`로 `input.files`를 채운 뒤 `change` 이벤트를 보내 확인합니다.
- 다른 그룹원의 동작(가입·룰렛)은 `execute_sql`로 다른 사용자를 흉내 내 커밋하면 Realtime 반영까지 확인할 수 있습니다. 끝나면 테스트 그룹을 삭제합니다.
- 같은 주소에 `#`만 붙여 이동하면 새로고침되지 않아 새 코드가 적용되지 않습니다. `location.reload()`를 씁니다.

## 구조

- 아이콘(`icon.js`)은 이모지(16자 이하) 또는 사용자가 올린 이미지입니다. 이미지는 기기에서 정사각형으로 잘라 96px webp/jpeg **data URL**로 줄여 `icon` 문자열에 그대로 저장합니다(Storage 미사용, 최대 60000자). DB 제약은 `^data:image/(png|jpeg|webp);base64,` 형식만 허용합니다. 아이콘은 항상 `renderIcon()`/`iconWithText()`로 그리고, `<option>`처럼 글자만 쓸 수 있는 곳에서는 `iconLabel()`(이미지는 🖼️)을 씁니다. 아이콘을 글자로 직접 입력하는 칸은 두지 않습니다.
- `index.html`에서 일반 `<script>`(모듈 아님)를 `date-utils.js` → `icon.js` → `storage.js` → supabase-js CDN → `sync.js` → `script.js` → `group.js` 순서로 불러옵니다. 모든 파일이 전역 스코프를 공유하므로 이 순서에 의존합니다. `group.js`는 `script.js`의 `showToast`, `setView`, `getStatus`, `describe`, `LEVEL_LABEL`을 사용합니다.
  - `date-utils.js`: 날짜는 모두 기기 현지 기준 `YYYY-MM-DD` 문자열로 다룹니다. 문자열 비교로 날짜 순서를 비교합니다.
  - `storage.js`: `localStorage` 키는 `when-did-i:items`, `when-did-i:sort`입니다. 불러올 때 `sanitizeItem`으로 형태를 정리하므로, 데이터 필드를 바꾸면 여기도 함께 수정합니다.
  - `sync.js`: Supabase 동기화를 맡습니다(프로젝트 `checklist`, ref `jyrcxrpbrdvxppbdzgvd`). Google 로그인(OAuth)으로만 동기화하고, 로그인하지 않으면 기기에만 저장합니다. 익명 로그인은 꺼져 있으며, 예전 익명 세션은 `handleSession`이 로그아웃시킵니다. 로그인 상태는 `onAuthStateChange` 하나로 처리합니다. 테이블은 `public.items`이고, 기본 키는 `(user_id, id)`이며, RLS로 자기 행만 접근할 수 있고, `anon` 역할은 권한이 없습니다. 화면은 항상 localStorage 기준으로 그리고, `persist()`가 `cloudSchedulePush()`를 불러 마지막 동기화 상태(`when-did-i:synced`, userId별)와 비교한 차이만 upsert/delete합니다. 로그인할 때, 탭으로 돌아올 때, 온라인으로 복귀할 때 `cloudPull()`이 `mergeItems()`로 3-way 병합합니다. 로그아웃하면 기기 기록을 지웁니다(다른 사람이 같은 기기로 로그인해도 기록이 섞이지 않도록).
  - `group.js`: 그룹과 집안일 룰렛을 담당합니다. 테이블은 `groups`, `group_members`, `group_chores`, `chore_logs`(누가 언제 했는지), `roulette_spins`입니다. 모든 RLS는 `is_group_member(group_id)`(security definer) 기준입니다. 그룹 생성·가입·룰렛 뽑기·당첨 완료는 클라이언트가 직접 insert하지 않고 RPC(`create_group`, `join_group`, `spin_roulette`, `complete_spin`)로만 처리합니다. 당첨자는 서버에서 `random()`으로 뽑습니다. 그룹 테이블은 `supabase_realtime` publication에 포함되어 있으며, 다른 사람이 돌린 룰렛은 Realtime INSERT를 받아 같은 애니메이션을 재생합니다. 초대 링크 `?join=코드`는 로그인 리디렉션 전에 sessionStorage에 저장합니다.
  - RLS를 검증할 때는 `execute_sql`에서 `set local role authenticated` + `set_config('request.jwt.claims', ...)`로 다른 사용자를 흉내 내고, 마지막에 `raise exception`으로 결과를 반환하면서 롤백합니다.
  - Google OAuth 클라이언트는 Google Cloud 프로젝트 `checklist-512206`에 있습니다(리디렉션 URI는 `https://jyrcxrpbrdvxppbdzgvd.supabase.co/auth/v1/callback`). 새 배포 주소를 추가하면 Supabase Auth의 Redirect URLs에도 `주소/**`를 등록합니다.
  - `script.js`: 상태(`items`)를 바꾼 뒤 `persist()` → `render()` 순서로 호출합니다. `render()`는 목록 보기와(달력 보기 중이면) 달력까지 다시 그립니다.
- 항목 데이터: `{ id, name, icon, cycleDays|null, history: string[], createdAt }`. DB 컬럼은 snake_case(`cycle_days`, `created_at`)이고 `history`는 `date[]`이며, 변환은 `toRow`/`fromRow`가 합니다. 필드를 바꾸면 마이그레이션, `sanitizeItem`, `toRow`/`fromRow`, `itemKey`를 함께 수정합니다. `history`는 최신 날짜가 앞에 오고, `history[0]`이 마지막으로 한 날입니다. 날짜를 추가하거나 바꿀 때는 항상 `normalizeHistory()`로 중복을 없애고 정렬합니다.
- 다음 예정일은 `getNextDue(item)` = `history[0] + cycleDays`로 계산합니다(저장하지 않음). 달력은 다음 예정일만 표시하고, 오늘보다 이전이면 그 날짜에 지난 예정(빨간색)으로 표시합니다.
- 상태 단계: `경과일 ÷ cycleDays`가 0.7 미만이면 ok, 0.7 이상 1 미만이면 soon, 1 이상이면 over, 주기가 없으면 none. 카드에 `level-*` 클래스로 표시합니다.
- 화면 요소는 `textContent`와 `<template>`으로 만듭니다. 사용자가 입력한 내용을 `innerHTML`에 넣지 않습니다.
- 검색·AI 노출: `<head>` 메타·JSON-LD(canonical은 Vercel 주소), `robots.txt`, `sitemap.xml`, `llms.txt`, `og-image.png`(1200×630). 기능을 추가하면 JSON-LD `featureList`와 `llms.txt`도 고치고, 내용이 바뀌면 `sitemap.xml`의 `lastmod`를 갱신합니다.

## 주의할 점

- `alert`/`confirm`/`prompt`를 쓰지 않습니다. 미리보기 브라우저나 일부 인앱 브라우저에서 막혀 `confirm()`이 항상 `false`를 돌려줍니다. 위험한 동작은 화면 안에서 확인받습니다(예: 삭제 버튼을 두 번 누르기 + 토스트에서 되돌리기).
- Emoji 13 이상(🪥, 🪴 등)은 Windows 10에서 네모(□)로 깨집니다. 아이콘을 추가할 때 주의하고, 바꾼 아이콘은 `storage.js`의 `ICON_FALLBACK`에 등록합니다.
- 색상은 `style.css` `:root`의 CSS 변수로만 지정하고, `prefers-color-scheme: dark`에서도 같은 변수를 다시 정의합니다.
- 버튼에는 `white-space: nowrap`을 적용하고, 터치 영역은 최소 44px로 유지합니다.
- 모바일 기준은 `max-width: 480px`입니다. 모바일 상단은 grid + `display: contents`로 두 줄(제목·동기화·계정 / 탭·정렬)로 배치하므로, 헤더에 요소를 추가하면 `grid-template-areas`도 고칩니다.
- Google 로그인 앱은 테스트 모드라서 Google Cloud에 등록한 테스트 사용자만 로그인할 수 있습니다.
- `<dialog>`는 열려 있을 때 `showModal()`을 다시 부르면 오류가 납니다. 배경을 눌러 닫을 때는 좌표로 판단합니다(`event.target`만 보면 안쪽 여백을 눌러도 닫힘).
- `googlef2bd8a129c3794f7.html`은 Google Search Console 소유권 확인 파일입니다(속성 `https://checklist-five-pi.vercel.app/`, sitemap 제출 완료). 지우면 소유권이 풀리므로 그대로 둡니다. FAQ 문구를 바꾸면 본문 `.faq`와 `<head>`의 FAQPage JSON-LD를 함께 고칩니다.
- 코드 주석과 커밋 메시지는 한국어로 씁니다.
- Windows PowerShell 5.1에서 `git commit -m`에 큰따옴표가 들어가면 인자가 깨집니다. 메시지를 파일로 저장해 `git commit -F <파일>`로 커밋하거나 Bash를 사용합니다.
- PowerShell 5.1로 실행하는 `.ps1`에 한글이 있으면 UTF-8 BOM이 있어야 깨지지 않습니다.
- Claude in Chrome: 창이 최대화되어 있으면 `resize_window`가 듣지 않으니, 375px `iframe`으로 모바일 화면을 확인합니다. `searchadvisor.naver.com`은 안전 제한으로 열 수 없고, `validator.schema.org`는 reCAPTCHA가 뜨면 사용자가 직접 풀어야 합니다.
