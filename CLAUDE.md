# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태
UptimeRobot과 비슷한 웹사이트 가동 모니터링 서비스. **아직 코드가 없는 계획 단계**이며, 아래 내용은 확정된 설계다. 1단계(뼈대) 구현 후 실제 명령어와 구조로 이 파일을 갱신할 것.

## 확정된 결정사항
- 스택: Next.js(App Router) + TypeScript, Tailwind + shadcn/ui, Recharts, PostgreSQL + Drizzle ORM, Better Auth(이메일+비밀번호), Nodemailer(SMTP), Slack Incoming Webhook, Vitest
- 실행 환경: 우선 Windows 로컬. Postgres와 Mailpit은 Docker Compose로 실행. 나중에 서버로 옮길 수 있게 web/worker Dockerfile 유지
- 회원가입: 공개 가입 없음. 사용자가 0명일 때 `/setup`에서 첫 관리자를 만들고, 이후에는 관리자가 보낸 초대 링크(`/invite/[token]`)로만 가입
- 공유 범위: 팀 전체 공유. 모니터와 알림 채널에 사용자별 소유 구분이 없음(`createdBy`는 기록용)
- 체크 간격: 1분 또는 5분. 체크 결과 보관 기간은 30일(`CHECK_RETENTION_DAYS`)
- 1차 범위에 SSL 만료 알림과 공개 상태 페이지 포함

## 아키텍처 (big picture)
- **웹(Next.js)과 워커(`worker/index.ts`, 상시 실행 Node 프로세스)가 분리**되어 있고 같은 Postgres를 공유한다. 1분 간격 체크는 서버리스 크론이 아니라 워커가 담당한다.
- Drizzle 스키마(`src/lib/db/schema.ts`), 체크·판정 로직(`src/lib/monitor/`), 알림 발송(`src/lib/notify/`)은 웹과 워커가 함께 쓰는 공용 코드다. 웹은 "테스트 발송"에 notify를 사용한다.
- 워커 루프: 10초마다 `nextCheckAt <= now AND enabled`인 모니터를 조회하고, 동시성 20으로 fetch(AbortController 타임아웃)를 실행한다. 결과는 `checks`에 저장한다.
- 상태 판정: **연속 2회 실패 시 down, 1회 성공 시 up.** 상태가 바뀔 때만 `incidents`를 열거나 닫고 다운/복구 알림을 보낸다. 체크할 때마다 알림을 보내지 않는다.
- SSL: https 모니터는 하루 1회 `tls.connect`로 만료일을 조회한다. 14/7/1일 전에 한 번씩 알리고, `ssl_alerts_sent`로 중복을 막는다.
- 인증 보호: 미들웨어가 `/status/*`, `/login`, `/setup`, `/invite/*` 외의 모든 경로를 보호한다. 공개 상태 페이지에는 URL과 에러 상세를 노출하지 않는다.
- 대시보드 갱신은 30초 폴링. 웹소켓은 쓰지 않는다.

## 설정값 위치
- `.env`(커밋 금지, `.env.example`만 커밋): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SMTP_HOST/PORT/USER/PASS/FROM`, `CHECK_RETENTION_DAYS`
- DB(대시보드에서 관리): 수신 이메일 주소와 Slack webhook URL(`alert_channels`). webhook URL은 화면에서 끝 4자리만 보이게 마스킹한다.
- 로컬에서는 SMTP를 Mailpit(`localhost:1025`, 웹 UI `http://localhost:8025`)으로 보내 실제 발송을 막는다.

## 개발 진행 방식
계획된 단계: 뼈대 → 인증 → 모니터 CRUD → 워커 → 대시보드 → 알림 → SSL → 상태 페이지 → 정리. 단계마다 실행해서 확인한 뒤 커밋한다. 전체 계획은 사용자 계획 파일을 참고한다.
