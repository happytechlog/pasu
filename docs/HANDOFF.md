# HANDOFF

_마지막 갱신: 2026-11-01 · 10단계(시간대) 끝남: 화면은 보는 사람 시간대, 이메일은 팀 알림 시간대, Slack은 읽는 사람 시간대_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지, 체크 보관 기간·알림 시간대 설정, Docker 스택(`migrate` → `web` + `worker`).
- 시간대: 웹은 `<TimeZoneSync>`가 브라우저 시간대를 `tz` 쿠키에 넣고 서버가 `getViewerTimeZone()`으로 읽는다(첫 방문 한 번만 KST로 그렸다가 refresh). 목록·차트 설명에 "시간대 …"를 표시한다. 이메일은 `/settings/general`의 알림 시간대 + 약칭(`14:03 KST`, `23:10 PST`). Slack은 `<!date^unix^{date_num} {time_secs}|대체 텍스트>`.
- 일별 집계(`monitor_daily_stats`, 공개 페이지 90일 막대, 차트 버킷 기준점)는 KST 고정. 공개 페이지 하단에 "일별 막대는 한국 시간(KST) 날짜 기준"이라고 적었다.
- typecheck, lint, build, test(113개) 통과. Docker 스택을 새 이미지로 띄워 마이그레이션 0007 적용, 브라우저(LA 시간대)에서 목록·상세 차트·설정 저장 확인, curl로 공개 페이지의 쿠키별(없음/서울/LA/잘못된 값) 표시 확인. 알림 문구는 DB 설정을 읽는 `buildAlert`로 출력만 확인했다(실제 발송은 안 함).
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 상태 페이지 `acme-status`. 알림 시간대는 기본값(Asia/Seoul)으로 되돌려 두었다. 지금 Docker 스택이 실행 중이다.

## 다음 할 일
- `/settings/alerts`의 테스트 발송으로 새 Slack 형식(PasuMonitor 이름, 색 막대, `<!date>` 시각)을 실제 Slack에서 확인한다. 로컬 `.env`의 SMTP가 실제 Gmail이라 이메일 테스트 발송은 실제 주소로 간다.
- 그 뒤 `PLAN.md`의 "보류·나중에 정할 것"(배포 위치, webhook 암호화, 키워드 체크, 점검 시간) 중에서 사용자와 고른다.

## 미해결·결정 필요
- 사용자별 시간대 고정(출장 중에도 서울 시간 보기)은 없다. 필요하면 `user.timezone`을 두고 쿠키보다 우선하면 된다.
- 6시간 차트 버킷은 KST 자정 기준이라 LA에서 보면 경계가 02/08/14/20시다.
- 기존: "실패 테스트" 모니터는 Docker에서 down(README Docker 섹션). 보관 기간 30일 미만이면 30일 차트에 빈 구간. 없는 slug는 HTTP 200. 알림 재시도 없음. 채널 수정 화면·비밀번호 재설정 없음.

## 알아둘 것
- `ActionForm`(React 19 form action)은 제출 후 폼을 리셋하는데 `<select>`의 `defaultValue`는 마운트 뒤 다시 적용되지 않는다. 저장값이 바뀌는 select에는 `key={값}`을 준다(`settings/general/page.tsx`).
- `Intl.supportedValuesOf("timeZone")`에는 `UTC`가 없다. `allTimeZones()`가 앞에 붙인다.
- Slack 앱으로 만든 webhook은 `username`/`icon_emoji`를 무시한다. 로컬 `.env`의 `SMTP_FROM`이 코드 기본값보다 우선한다.
- dev와 Docker 스택을 동시에 띄우지 않는다(포트 3000, 워커 중복). Windows `TaskStop`은 자식 프로세스를 남긴다.
- Git Bash heredoc과 PowerShell 5.1 인자는 한글·큰따옴표를 깨뜨린다. 파일은 Write로 만들고 커밋 메시지는 `git commit -F 파일`로 쓴다.
