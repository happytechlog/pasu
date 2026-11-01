# HANDOFF

_마지막 갱신: 2026-11-01 · 9단계(정리: Docker/compose) 완료. PLAN의 모든 단계 끝남_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지, 체크 보관 기간 설정·삭제.
- 새로 추가: `Dockerfile`(타깃 `web`, `worker`), `.dockerignore`, `worker/migrate.ts`, compose `app` 프로필(`migrate` → `web` + `worker`), `npm run worker:build`(esbuild), README 교체.
- typecheck, lint, build, test(101개) 통과. 실제로 확인한 것: `docker compose --profile app up -d --build --wait`로 전부 healthy, migrate가 기존 DB에선 no-op, 빈 Postgres에선 7개 마이그레이션 적용 + `app_settings` 기본 행 생성, 컨테이너 웹에서 `/api/health`·로그인·대시보드·공개 상태 페이지·정적 CSS 200, 컨테이너 워커가 체크·purge·DOWN 메일(Mailpit 수신) 수행, `docker compose stop` 시 워커가 SIGTERM으로 정상 종료.
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 모니터 4개, 채널 2개, 상태 페이지 `acme-status`. 컨테이너는 dev와 **같은 DB 볼륨**을 쓴다. 지금 web/worker 컨테이너는 정지 상태다.

## 다음 할 일
- PLAN 단계는 모두 끝났다. 다음은 `PLAN.md`의 "보류·나중에 정할 것"(배포 위치, webhook 암호화, 키워드 체크, 점검 시간) 중에서 사용자와 고른다.

## 미해결·결정 필요
- "실패 테스트" 모니터(`http://localhost:3000/api/health`)는 Docker로 돌리면 down이 된다(dev로 돌아오면 복구). 이유와 외부 공개 시 할 일은 README의 Docker 섹션에 있다.
- 기존: 보관 기간 30일 미만이면 30일 차트에 빈 구간이 생긴다. `monitor_daily_stats`는 계속 쌓인다. 없는 slug는 HTTP 200. 알림 재시도 없음. 채널 수정 화면·비밀번호 재설정 없음. 실제 Slack 발송 미확인.

## 알아둘 것
- dev와 Docker 스택을 동시에 띄우면 포트 3000이 충돌하고 워커 두 개가 같은 DB를 체크한다(SKIP LOCKED라 중복 체크는 없지만 로그가 나뉜다). 하나만 쓴다.
- `npm install` 시 `allow-scripts` 경고가 나오지만 esbuild는 플랫폼별 optional 패키지 바이너리를 써서 동작한다.
- 로컬 `npm run build`도 이제 `.next/standalone`을 만든다. 로컬에서 `npm start`(next start)는 standalone과 함께 쓸 때 확인하지 않았다.
- Windows에서 `TaskStop`은 자식 프로세스를 남긴다. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`로 확인하고 PID로 종료한다.
- Cache Components: 서버 컴포넌트에서 `new Date()`를 요청 데이터보다 먼저 쓰면 dev에서 "unstable value" 에러. `await connection()`을 먼저 호출한다.
- Git Bash heredoc은 JSX·백틱·한글이 섞인 긴 내용에서 깨진다. 파일은 Write 도구로 만든다.
