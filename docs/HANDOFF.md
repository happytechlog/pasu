# HANDOFF

_마지막 갱신: 2026-11-01 · 8단계(공개 상태 페이지) 완료_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지. `/settings/status-pages`에서 제목·주소(slug)·모니터를 골라 만들고, `/status/<slug>`는 로그인 없이 전체 상태 배너, 모니터별 상태(정상/장애/확인 중/일시정지), 90일 일별 가동률 막대(초록 100%, 주황 99% 이상, 빨강 99% 미만, 회색 데이터 없음)를 보여준다. 30초마다 갱신된다.
- 90일 막대는 `monitor_daily_stats`(모니터·KST 날짜별 total/ok)에서 읽는다. 워커가 체크를 저장하는 트랜잭션에서 upsert하고, 마이그레이션 `0005`가 기존 checks로 채웠다(검증: 날짜별 집계가 원시 checks와 일치).
- typecheck, lint, build, test(99개) 통과. 브라우저로 확인한 것: 생성(slug 소문자화), 중복 slug·잘못된 slug 에러(입력 유지), 수정(제목·모니터 변경이 공개 페이지에 반영), 수정 화면에서 삭제, 장애 배너("2개 중 1개…"), 일시정지 표시, 모바일 390px. 비로그인 curl로 받은 HTML에 DB의 모니터 URL·에러 문자열이 하나도 없음을 확인했다.
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 모니터 4개, 채널 2개(운영팀 Slack = 가짜 webhook, 운영팀 메일), 상태 페이지 `acme-status`(Example, 히스토리 데모).

## 다음 할 일: 9단계 정리
- 오래된 `checks` 삭제(`CHECK_RETENTION_DAYS`, 기본 30일, 하루 1회). **CLAUDE.md 워커 설명에는 이미 있다고 적혀 있지만 아직 코드가 없다.** 워커에 넣는다.
- `monitor_daily_stats`는 checks와 같이 지우면 안 된다(90일 막대가 사라짐). 지운다면 90일보다 오래된 것만 지운다.
- web/worker Dockerfile, compose 통합. 워커 이미지가 마이그레이션을 실행할지, 별도 단계로 둘지 정한다.

## 미해결·결정 필요
- 없는 slug(`/status/nope`)는 404 화면과 `noindex`를 보여주지만 HTTP 상태는 200이다(`notFound()`가 Suspense 안에서 스트리밍 뒤에 호출됨). 다른 페이지도 같은 구조다.
- 공개 페이지는 캐시 없이 요청마다 DB를 읽는다. 공개로 트래픽이 크면 `"use cache"`와 짧은 수명 적용을 검토한다.
- 알림 발송 실패 시 재시도·기록이 없다(로그만). SSL 알림은 먼저 기록하므로 발송이 실패해도 다시 보내지 않는다. SSL은 만료일만 본다.
- 채널 수정 화면 없음. `/api/health`는 공개. 비밀번호 재설정 없음. 실제 Slack 발송은 미확인.

## 알아둘 것
- Windows에서 `TaskStop`은 자식 프로세스(next dev, tsx 워커)를 남긴다. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`로 `simple_monitoring` 명령줄을 확인하고 PID로 종료한다.
- Cache Components: 서버 컴포넌트에서 `new Date()`를 요청 데이터보다 먼저 쓰면 dev에서 "unstable value" 에러가 난다(기본 인자 `now = new Date()`도 해당). `await connection()`을 먼저 호출한다.
- Aside REPL: 호출마다 `listBrowserTabs()`→`attachBrowserTab()`으로 다시 붙는다. Suspense 내용은 `goto` 직후 없을 수 있으니 짧게 기다린 뒤 snapshot하고 ref로 클릭한다. `page.once('dialog')`는 안 되므로 `ConfirmSubmit`은 `window.confirm`을 evaluate로 바꿔서 누른다.
- Git Bash heredoc은 JSX·백틱이 섞인 긴 내용에서 깨진다. 새 파일은 Write 도구로 만든다.
