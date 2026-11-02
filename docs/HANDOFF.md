# HANDOFF

_마지막 갱신: 2026-11-02 · 서비스 이름을 파수(Pasu)로 정함, Slack 알림을 UptimeRobot식 레이아웃으로 바꿈. PLAN의 모든 단계 끝남_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지, 체크 보관 기간 설정·삭제, Docker 스택(`migrate` → `web` + `worker`).
- 이름: UI "파수", 이메일 "Pasu Monitor"(제목 `[Pasu Monitor] ...`, 보내는 사람 이름), Slack 발신자 "PasuMonitor"(🛡️), 패키지·이미지 `pasu`/`pasu-web`/`pasu-worker`, User-Agent `Pasu/1.0`.
- Slack 알림: 제목 블록 + 상태 색 막대 attachment(감지/복구 시각, 확인한 URL, 원인 또는 다운 시간, SSL 만료일·남은 기간) + "모니터 보기" 버튼. 이메일 본문은 기존 한 줄 텍스트 그대로.
- typecheck, lint, build, test(105개) 통과. 새 이미지로 `docker compose --profile app up -d --wait` 실행해 web healthy, 워커 체크·purge 동작 확인. 사용자가 실제 Slack(예전 Incoming WebHooks 연동)으로 기존 형식 메시지 수신을 확인함. **새 형식 메시지는 실제 Slack에서 아직 보지 않았다.**
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 상태 페이지 `acme-status`. 컨테이너는 dev와 **같은 DB 볼륨**을 쓴다. 지금 Docker 스택이 실행 중이다.

## 다음 할 일
- `/settings/alerts`의 테스트 발송으로 새 Slack 형식(이름 PasuMonitor, 색 막대)을 실제로 확인한다.
- 그 뒤 `PLAN.md`의 "보류·나중에 정할 것"(배포 위치, webhook 암호화, 키워드 체크, 점검 시간) 중에서 사용자와 고른다.

## 미해결·결정 필요
- "실패 테스트" 모니터(`http://localhost:3000/api/health`)는 Docker로 돌리면 down이 된다(dev로 돌아오면 복구). 이유는 README의 Docker 섹션에 있다.
- 기존: 보관 기간 30일 미만이면 30일 차트에 빈 구간이 생긴다. `monitor_daily_stats`는 계속 쌓인다. 없는 slug는 HTTP 200. 알림 재시도 없음. 채널 수정 화면·비밀번호 재설정 없음.
- 예전 이미지 `simple-monitoring-web`/`simple-monitoring-worker`가 로컬에 남아 있다(지워도 됨).

## 알아둘 것
- Slack 앱으로 만든 webhook은 `username`/`icon_emoji`를 무시하고 앱 이름을 쓴다. 예전 Incoming WebHooks 연동만 적용된다(README에 안내).
- 로컬 `.env`의 `SMTP_FROM`이 코드 기본값보다 우선한다. 보내는 사람 이름은 거기서 바뀐다.
- dev와 Docker 스택을 동시에 띄우면 포트 3000이 충돌하고 워커 두 개가 같은 DB를 체크한다. 하나만 쓴다.
- 이미지 이름이 바뀌거나 캐시가 없으면 compose가 먼저 pull을 시도해 `pull access denied`를 띄운 뒤 로컬 빌드한다(정상). `npm ci` 단계만 약 3분 걸린다.
- Windows에서 `TaskStop`은 자식 프로세스를 남긴다. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`로 확인하고 PID로 종료한다.
- Cache Components: 서버 컴포넌트에서 `new Date()`를 요청 데이터보다 먼저 쓰면 dev에서 "unstable value" 에러. `await connection()`을 먼저 호출한다.
- Git Bash heredoc은 JSX·백틱·한글이 섞인 긴 내용에서 깨진다. 파일은 Write 도구로 만든다.
