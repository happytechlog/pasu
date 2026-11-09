# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**파수(Pasu)**: UptimeRobot과 비슷한 웹사이트 가동 모니터링 서비스. UI에는 "파수", 이메일(제목 머리말 `[Pasu Monitor]`·보내는 사람 이름)에는 "Pasu Monitor", Slack 발신자 이름은 "PasuMonitor", ASCII만 되는 곳(패키지명·Docker 이미지·User-Agent)에는 "pasu"/"Pasu"를 쓴다. 전체 계획과 단계별 범위는 `docs/PLAN.md`에 있다. 단계 작업을 시작할 때 해당 단계를 읽는다.

## 작업 규칙: 단계가 끝날 때마다
1. 실행해서 확인하고 typecheck, lint, build, test를 통과시킨 뒤 커밋한다.
2. `docs/PLAN.md`에서 해당 단계를 체크한다. 범위가 바뀌었으면 함께 고친다.
3. `docs/HANDOFF.md`를 **새로 쓴다(누적하지 않는다).** 현재 동작하는 것, 다음 단계와 시작 전에 확인할 것, 미해결 이슈, 알아둘 함정을 30줄 이내로 쓴다.
4. 명령어, 아키텍처, 늘 지킬 규칙이 바뀐 경우에만 이 파일(CLAUDE.md)을 고친다.
5. 2~4의 문서 변경은 별도 커밋(`docs: ...`)으로 남긴다.

## 현재 진행 상황
@docs/HANDOFF.md

## 명령어
```bash
docker compose up -d --wait   # Postgres(5432) + Mailpit(SMTP 1025, UI http://localhost:8025). Docker Desktop이 켜져 있어야 함
cp .env.example .env          # 최초 1회
npm run dev                   # 웹 http://localhost:3000
npm run worker                # 워커(watch 모드). watch 없이 실행: npm run worker:start
# 개발용 체크 대상(프로덕션은 404): /api/test/fail?status=503, /api/test/slow?ms=15000
#   localhost는 사설 주소라서 .env에 MONITOR_ALLOWED_NETWORKS=127.0.0.0/8,::1/128 이 있고 관리자가 모니터를 저장해야 체크된다
npm run typecheck             # next typegen 후 tsc (LayoutProps 등 라우트 타입은 생성된 것이라 typegen이 필요)
npm run lint
npm run build                 # Cache Components 검증이 빌드 때 모든 라우트에 대해 실행됨
npm test                      # vitest run
npx vitest run path/to/file.test.ts -t "test name"   # 단일 테스트
npm run db:generate           # schema.ts 변경 → drizzle/ 에 SQL 마이그레이션 생성 (생성 파일도 커밋)
npm run db:migrate            # 마이그레이션 적용
npm run db:studio
npm run worker:build          # esbuild로 dist/worker/{index,migrate}.mjs 번들 (Docker worker 이미지용)
docker compose --profile app up -d --build --wait   # 전체 스택: migrate(1회) → web(:3000) + worker. 로컬 dev 서버/워커와 동시에 띄우지 않는다
docker compose -f docker-compose.prod.yml up -d --build --wait   # 운영용: 비밀값(POSTGRES_PASSWORD 등)이 .env에 없으면 시작 전에 실패, DB·Mailpit 포트 없음, 프로젝트명 pasu(볼륨 분리)
```

## Next.js 16 주의사항
- `AGENTS.md`를 따른다. 학습 데이터와 API가 다르므로 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 확인한다.
- `next.config.ts`에서 **`cacheComponents: true`**를 쓴다. 그래서 `export const dynamic` / `revalidate` / `fetchCache` 라우트 설정은 **에러가 난다.**
  - 페이지에서 요청 시점 데이터(DB 조회, cookies, headers)를 읽는 컴포넌트는 `<Suspense>` 안에 두고, 필요하면 `await connection()`(`next/server`)을 호출한다. 예시는 `src/app/page.tsx`
  - Route Handler는 DB 조회만으로도 요청 시점에 실행되므로 별도 설정이 필요 없다.
  - 캐시할 데이터는 `"use cache"`를 쓴다.
- shadcn 스타일이 `base-nova`라서 컴포넌트가 Radix가 아니라 **`@base-ui/react`** 기반이다. `cn`은 `clsx`/`tailwind-merge`가 아니라 shadcn의 `cn` 패키지에서 온다(`src/lib/utils.ts`). 컴포넌트는 `npx shadcn@latest add <name>`으로 추가한다.

## 아키텍처
- **웹(Next.js)과 워커(`worker/index.ts`, 상시 실행 Node 프로세스, tsx로 실행)가 분리**되어 있고 같은 Postgres를 공유한다. 주기적 체크는 서버리스 크론이 아니라 워커가 한다. 워커는 `dotenv/config`로 `.env`를 직접 읽는다.
- 웹과 워커가 함께 쓰는 코드는 `src/lib/` 아래에 둔다. 이 코드는 Next 전용 API(`next/*`, React)에 의존하지 않아야 워커에서도 돌아간다.
  - `src/lib/db/`: Drizzle 클라이언트(개발 중 핫리로드를 위해 pg Pool을 `globalThis`에 캐시)와 스키마
  - `src/lib/mail.ts`: nodemailer 발송(초대 메일, 이후 이메일 알림)
  - `src/lib/monitor/`: `check.ts`(HTTP 체크, 순수), `state.ts`(상태 전이, 순수), `runner.ts`(워커의 DB 처리: 대상 선점·결과 기록·incident), `expected-status.ts`, `input.ts`(폼 zod 스키마), `stats.ts`(가동률·차트 버킷·SSL 일수·기간 포맷, 순수), `ssl.ts`(알림 임계값 판정·`tls.connect` 만료일 조회). 순수 함수는 단위 테스트한다
  - **접속 대상 정책(SSRF 방어)**: `network.ts`(순수: 주소 분류 `classifyAddress`=blocked/private/public, `MONITOR_ALLOWED_NETWORKS` 파싱, `createSafeLookup`), `safe-fetch.ts`(워커 전용: undici 커넥터로 연결 시점에 검사하는 `fetchFor(allowPrivate)`), `target.ts`(등록 시점 검사 `checkMonitorTarget`). 링크로컬·메타데이터(169.254/16 등)는 항상 차단. 사설·루프백 주소는 모니터의 `allow_private`가 true **이고** 주소가 `MONITOR_ALLOWED_NETWORKS`(CIDR 목록, 기본 빈 값) 안일 때만 허용. 사설 주소를 가리키는 URL은 관리자만 저장할 수 있고(`monitors/actions.ts`) 저장 시 `allow_private`가 정해진다. 워커는 DNS 결과의 모든 주소를 검사하고 리다이렉트 홉도 같은 커넥터를 지난다. SSL 점검(`fetchCertExpiry`)도 같은 정책이다. 새 외부 요청 코드를 추가하면 `fetchFor`를 쓴다
  - `src/lib/settings.ts`: 팀 전체 설정(`app_settings` 한 행, id=1). `getSettings`(행이 없으면 기본값), `saveSettings`(넘긴 필드만 갱신), 폼 zod. 체크 보관 기간(기본 30일, 7~365일)과 알림 시간대(기본 `Asia/Seoul`)가 있다
  - `src/lib/timezone.ts`: 시간대 검증·정규화(`normalizeTimeZone`), 메모이즈한 `dateTimeFormat`, 약칭(`timeZoneLabel`: 서울은 "KST", 그 외 PST/PDT 등). **화면에 시각을 쓸 때 `timeZone: "Asia/Seoul"`을 직접 넣지 않는다.** 웹은 `getViewerTimeZone()`(`src/server/timezone.ts`, 루트 레이아웃의 `<TimeZoneSync>`가 브라우저 시간대를 `tz` 쿠키에 저장, 없으면 KST), 알림은 설정의 알림 시간대를 쓴다. 일별 집계(`monitor_daily_stats`, `kstDay`, 차트 버킷 기준점)만 KST 고정이다
  - `src/lib/status-page/input.ts`: 상태 페이지 폼 zod(slug는 영문 소문자·숫자·하이픈 1~40자)
  - `src/lib/notify/`: `message.ts`(알림 문구: 이메일용 `text`와 Slack용 `slack` payload(제목 블록 + 색 막대 attachment + "모니터 보기" 버튼, 사용자 입력은 mrkdwn 이스케이프, 시각은 `<!date>` 토큰), 마스킹, 순수), `input.ts`(채널 폼 zod), `index.ts`(Slack/이메일 발송, 모니터별 활성 채널 조회). 워커는 결과 트랜잭션이 커밋된 뒤 `notifyMonitorEvent`로 보내고, 웹의 "테스트 발송"은 `buildAlert` + `sendToChannel`을 쓴다(`buildAlert`가 앱 URL과 알림 시간대를 채운다). 발송 함수는 채널별 결과를 돌려주고 throw하지 않는다
- 배포: `Dockerfile` 하나에 타깃 두 개. `web`은 `output: "standalone"`의 `server.js`, `worker`는 esbuild 단일 번들(node_modules 없음)이라 **워커가 import하는 코드는 번들 가능해야 한다**(동적 require·네이티브 모듈 금지, `pg-native`만 external). 마이그레이션은 `worker/migrate.ts`(drizzle-orm migrator, drizzle-kit과 같은 journal 테이블)를 compose의 1회성 `migrate` 서비스가 실행하고 web/worker는 그 완료를 기다린다. compose에서 app 서비스는 `app` 프로필이라 기본 `up`은 db+mailpit만 띄운다. 컨테이너에선 `DATABASE_URL`만 compose가 덮어쓰고(`db` 서비스), `SMTP_HOST`/`SMTP_PORT`는 `.env` 값을 그대로 쓴다(없으면 `mailpit:1025`). 컨테이너 안에서 `localhost`는 자기 자신이라 Docker에서 Mailpit으로 보내려면 `SMTP_HOST=mailpit`이어야 한다
- 웹 전용 서버 코드는 `src/server/`(`import "server-only"`)에 둔다. `auth.ts`(Better Auth 설정), `session.ts`(DAL: `getCurrentUser`/`requireUser`/`requireAdmin`), `invitations.ts`, `dashboard.ts`(대시보드 조회 쿼리), `status-pages.ts`(상태 페이지 조회. 공개용 `getPublicStatusPage`는 모니터 이름·상태·일별 집계만 select한다)
- 대시보드: 가동률은 **기간 내 ok 체크 / 전체 체크**(체크 0건이면 "—"). 차트는 SQL `date_bin`으로 버킷 집계(24h=15분, 7d=1시간, 30d=6시간, KST 자정 기준 정렬)하고 빈 버킷은 `fillBuckets`로 채운다. 차트는 라이브러리 없이 SVG(`monitors/[id]/response-chart.tsx`). 상태 색은 `globals.css`의 `--status-up/down/empty`, `--series-1` 토큰. 30초 갱신은 `src/components/auto-refresh.tsx`(`router.refresh()`, 탭이 숨겨지면 건너뜀)
- 인증 구조: `src/proxy.ts`(Next 16에서 middleware가 proxy로 이름이 바뀜)는 쿠키 유무만 보는 낙관적 검사다. **실제 권한 검사는 모든 페이지(Suspense 안)와 Server Action에서 `requireUser()`/`requireAdmin()`으로 다시 한다.** 공개 경로 목록은 `proxy.ts`의 `PUBLIC_PREFIXES`
  - 공개 가입은 `disabledPaths: ["/sign-up/email"]`로 막고, 계정은 서버에서 `auth.api.signUpEmail`로만 만든다(`/setup`, `/invite/[token]`). `role`은 `input: false`라 가입 후 DB에서 직접 설정한다.
  - 라우트 그룹: `(app)`은 헤더가 있는 로그인 영역, `(auth)`는 로그인·설정·초대 화면. 폼은 `ActionForm`(`useActionState`) + Server Action. 캐시를 쓰지 않으므로 액션 후 갱신은 `refresh()`(`next/cache`)
  - **클라이언트 컴포넌트에서 Server Action 모듈(`actions.ts`)을 직접 import하지 않는다.** 서버 컴포넌트에서 prop으로 넘긴다(타입만 `import type`). 직접 import했을 때 dev(Turbopack)에서 페이지가 1초마다 전체 새로고침되는 루프가 생겼다
- 워커: 10초마다 `nextCheckAt <= now AND enabled`인 모니터를 `FOR UPDATE SKIP LOCKED`로 선점하면서 `nextCheckAt`을 한 간격 뒤로 미룬다. 동시성 20으로 fetch(AbortController 타임아웃)를 실행하고, 결과는 행 잠금 트랜잭션 안에서 `checks`에 저장하고, 같은 트랜잭션에서 `monitor_daily_stats`(모니터·KST 날짜별 전체/성공 체크 수)를 upsert로 올린다. 공개 상태 페이지의 90일 막대는 이 테이블을 읽으므로 `checks` 보관 기간과 무관하다. **연속 2회 실패 시 down, 1회 성공 시 up.** 상태가 바뀔 때만 `incidents`를 열거나 닫고 알림을 보낸다(열린 incident는 모니터당 1건, 부분 유니크 인덱스). SSL은 별도 60초 루프가 24시간 안에 확인하지 않은 https 모니터를 `ssl_checked_at` 갱신으로 선점해 `tls.connect`(검증 끔, 만료된 인증서도 읽기 위해)로 만료일을 읽는다. 실패하면 약 1시간 뒤 재시도. 14/7/1일 전에 한 번씩 알리며 `ssl_alerts_sent`(모니터·만료일·임계값 유니크)에 먼저 넣고 성공한 경우에만 보낸다(인증서 갱신 → 만료일이 바뀌어 다시 알림). 보관 기간이 지난 `checks`는 시작할 때와 1시간마다 5000건씩 나눠 삭제한다(`purgeOldChecks`). 보관 기간은 매번 `app_settings`에서 읽으므로 관리자가 `/settings/general`에서 바꾸면 1시간 안에 반영된다. `monitor_daily_stats`는 지우지 않는다.

## 확정된 제품 결정
- 공개 가입 없음. 사용자가 0명일 때 `/setup`에서 첫 관리자를 만들고, 이후에는 관리자가 보낸 초대 링크(`/invite/[token]`, 7일 유효)로만 가입한다. 인증은 Better Auth(이메일+비밀번호)이고, auth 테이블은 2단계에서 추가한다. 그때 `monitors.createdBy`에 user FK를 연결한다.
- **팀 전체 공유**: 모니터와 알림 채널에 사용자별 소유 구분이 없다. 예외: **이메일 채널은 관리자만 만들 수 있고**(팀 SMTP로 임의 주소에 보내는 릴레이를 막기 위해), 사설 주소를 가리키는 모니터도 관리자만 저장할 수 있다. 채널 켜기·끄기·삭제와 모니터 연결은 멤버도 가능하다. 알림 채널 "테스트 발송"은 채널당 60초에 한 번(`alert_channels.last_test_at`, `src/lib/notify/policy.ts`).
- 보호 경로: `/status/*`, `/login`, `/setup`, `/invite/*`를 뺀 모든 경로. 공개 상태 페이지에는 URL과 에러 상세를 노출하지 않는다. 공개 페이지(`src/app/status/[slug]`, 라우트 그룹 밖이라 헤더 없음)는 조회 쿼리에서 그런 컬럼을 아예 select하지 않는 방식으로 지킨다.
- 설정값 위치: SMTP 서버, DB, 인증 시크릿은 `.env`(`.env.example`만 커밋). 체크 보관 기간과 알림 시간대처럼 팀이 운영 중에 바꾸는 값은 관리자 전용 `/settings/general`에서 바꾸며 DB(`app_settings`)에 저장한다(`.env`에 두지 않는다). 수신 이메일과 Slack webhook URL은 대시보드에서 관리하며 DB(`alert_channels`)에 저장한다. webhook URL은 화면에서 끝 4자리만 보이게 마스킹한다.
- 대시보드 갱신은 30초 폴링이다. 웹소켓은 쓰지 않는다. UI 문구는 한국어로 쓴다.
