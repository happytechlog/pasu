# HANDOFF

_마지막 갱신: 2026-11-01 · 8단계(공개 상태 페이지) 완료 + 체크 보관 기간 설정 추가_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지(`/settings/status-pages`, `/status/<slug>`, 90일 일별 막대는 `monitor_daily_stats`에서 읽음).
- 새로 추가: 관리자 전용 `/settings/general`("설정" 메뉴)에서 체크 보관 기간을 바꾼다. 기본 30일이고 7~365일까지 넣을 수 있다. 값은 `app_settings`(한 행)에 있다. 워커가 시작할 때와 1시간마다 이 값을 읽어 오래된 `checks`를 5000건씩 지운다(로그: `purged N check(s) older than Nd`). `monitor_daily_stats`는 지우지 않으므로 90일 막대는 유지된다. `.env`의 `CHECK_RETENTION_DAYS`는 없앴다(로컬 `.env`에 남아 있어도 무시된다).
- typecheck, lint, build, test(101개) 통과. 실제로 확인한 것: 서버 쪽 검증(5일 입력 시 거절), 365일로 저장하자 400일 전 체크만 삭제, 30일로 바꾸고 워커를 재시작하자 30일 넘은 19건 삭제, 일별 집계 행 수는 그대로, 비로그인 접근 시 로그인으로 이동.
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 모니터 4개, 채널 2개(운영팀 Slack = 가짜 webhook, 운영팀 메일), 상태 페이지 `acme-status`. 보관 기간은 30일.

## 다음 할 일: 9단계 정리 (남은 것)
- web/worker Dockerfile, compose 통합. 마이그레이션을 누가 실행할지(워커 시작 시 또는 별도 단계) 정한다. 마이그레이션 `0006`이 `app_settings` 기본 행을 넣는다.

## 미해결·결정 필요
- 보관 기간을 30일보다 짧게 하면 모니터 상세의 30일 차트와 가동률에 빈 구간이 생긴다(화면에 안내 문구 있음).
- `monitor_daily_stats`는 영원히 쌓인다(모니터당 하루 1행이라 작다). 필요하면 나중에 1년 넘은 것을 지운다.
- 없는 slug(`/status/nope`)는 404 화면과 `noindex`를 보여주지만 HTTP 상태는 200이다. 공개 페이지는 캐시 없이 요청마다 DB를 읽는다.
- 알림 발송 실패 시 재시도·기록이 없다(로그만). SSL은 만료일만 본다. 채널 수정 화면 없음. `/api/health`는 공개. 비밀번호 재설정 없음. 실제 Slack 발송은 미확인.

## 알아둘 것
- Windows에서 `TaskStop`은 자식 프로세스(next dev, tsx 워커)를 남긴다. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`로 `simple_monitoring` 명령줄을 확인하고 PID로 종료한다.
- dev 서버가 요청마다 `✓ Compiled in 1ms`를 찍으며 페이지가 계속 새로고침되는 일이 한 번 있었다. 코드를 되돌려도 계속됐고, dev 서버를 재시작하자 사라졌다. `actions.ts` 직접 import 문제(CLAUDE.md)가 아니면 먼저 재시작해 본다.
- Cache Components: 서버 컴포넌트에서 `new Date()`를 요청 데이터보다 먼저 쓰면(기본 인자 포함) dev에서 "unstable value" 에러가 난다. `await connection()`을 먼저 호출한다.
- Aside REPL: `listBrowserTabs()`에 앱 탭이 여러 개일 수 있으니 URL로 고른다. Suspense 내용은 잠깐 기다린 뒤 snapshot하고 ref로 클릭한다. `page.once('dialog')`는 안 되므로 `window.confirm`을 evaluate로 바꾼다.
- Git Bash heredoc은 JSX·백틱이 섞인 긴 내용에서 깨진다. 새 파일은 Write 도구로 만든다.
