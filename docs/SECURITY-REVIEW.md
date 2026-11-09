# 보안 점검 결과

_점검일: 2026-11-08 · 브랜치 `feature/review` (df7d35f 기준) · 코드는 수정하지 않았다._

대상: `src/proxy.ts`, `src/server/`, `src/app` 아래 `actions.ts`와 api 라우트, `worker/`, `src/lib/monitor/`, `src/lib/notify/`, `src/lib/mail.ts` (참고로 `src/lib/settings.ts`, `src/lib/timezone.ts`, `src/lib/status-page/input.ts`, `docker-compose.yml`, `Dockerfile`, `.env.example`도 읽었다).

직접 실행해 확인한 것은 세 가지다.
- Node 24 `fetch`에 `user:pass@` URL을 넣었을 때의 동작
- 로컬 `/api/auth/sign-up/email`과 변형 경로에 빈 본문 POST (가입이 일어날 요청은 보내지 않았다)
- nodemailer에 CRLF가 든 subject를 넣어 만들어진 MIME 헤더

## 요약

| 구분 | 건수 |
|---|---|
| 확실한 취약점 | 6건 (중간 2, 낮음 4) |
| 가능성만 있는 것 | 5건 (모두 낮음) |
| 문제 없음으로 확인한 영역 | 인증 검사, 초대 토큰, Slack 이스케이프, 메일 헤더, SQL, 공개 페이지 노출 |

가장 먼저 볼 것은 **S-1(SSRF)** 과 **S-2(이메일 채널 오남용)** 이다.

## 1. 확실한 취약점

| ID | 위치 | 재현 시나리오 | 심각도 | 수정안 |
|---|---|---|---|---|
| S-1 | `src/lib/monitor/input.ts:16-23`<br>`src/lib/monitor/check.ts:77-83`<br>`src/lib/monitor/ssl.ts:62-74` | 로그인한 일반 멤버가 모니터 URL을 `http://169.254.169.254/latest/meta-data/`, `http://localhost:3000/api/health`, `http://mailpit:8025/`, `http://db:5432`로 등록한다. 워커가 요청을 보낸다.<br>대시보드에 상태코드·응답시간·실패 사유가 나오고, 연결 거부·타임아웃·200/404 차이로 내부망 포트와 경로를 알아낼 수 있다.<br>`redirect: "follow"`라서 외부 서버가 내부 주소로 리다이렉트해도 따라간다.<br>SSL 점검(`tls.connect`)은 임의의 host:port에 연결해 인증서 만료일까지 읽어온다.<br>사설망·루프백·링크로컬·메타데이터 IP를 막는 코드는 없다. | **중간** (응답 본문은 저장하지 않아 블라인드 SSRF다. 클라우드나 사내망에 배포하면 높음) | ① 워커 전용 `undici` Agent의 `connect.lookup`에서 DNS 해석 결과 IP를 검사해 사설·루프백·링크로컬 대역(`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`)을 차단한다.<br>② 리다이렉트는 `manual`로 받아 홉마다 같은 검증을 한다.<br>③ `fetchCertExpiry`도 같은 IP 검사를 거친다.<br>④ 내부 서비스를 감시해야 하면 환경변수 허용 목록으로 예외를 둔다. |
| S-2 | `src/app/(app)/settings/alerts/actions.ts:15-27, 47-62`<br>`src/lib/notify/input.ts:31-35` | 멤버가 이메일 채널에 외부인 주소를 등록하고 "테스트 발송"을 반복한다. 회사 SMTP로 임의 주소에 메일을 계속 보낼 수 있다.<br>횟수 제한도 없다. | **중간** (스팸 릴레이, 발신 도메인 평판 훼손) | 이메일 채널 생성은 관리자 전용으로 하거나 허용 도메인 목록을 둔다. 테스트 발송에는 채널·사용자별 쿨다운(예: 분당 1회)을 둔다. |
| S-3 | `src/lib/monitor/input.ts:16-23`<br>`src/lib/monitor/check.ts:59-60`<br>`src/lib/notify/message.ts:155, 166` | 모니터 URL을 `http://user:pass@host/`로 등록한다.<br>Node 24의 `fetch`는 이 URL을 거부한다. 메시지는 `Request cannot be constructed from a URL that includes credentials: http://u:p@…`이고, 직접 확인했다.<br>이 메시지가 `checks.error`와 `incidents.reason`에 저장된다. 대시보드, Slack, 이메일 알림에 비밀번호가 평문으로 나간다. | **낮음~중간** | zod의 URL 검증에서 `u.username`과 `u.password`가 있으면 거부한다. 인증이 필요하면 별도 헤더 필드로 처리한다. 에러 문자열에 URL이 들어가면 마스킹한다. |
| S-4 | `docker-compose.yml:21-26, 38-39` | Postgres(5432), Mailpit SMTP(1025), Mailpit UI(8025)가 모든 인터페이스에 열려 있다. DB 계정은 `monitor/monitor`다.<br>Mailpit UI에는 인증이 없다. 외부에서 접근할 수 있으면 초대 메일의 토큰 링크를 그대로 가져가 계정을 만들 수 있다. 초대 제한이 우회된다. | **높음(외부 노출 시)** / 로컬 개발만이면 낮음 | `127.0.0.1:5432:5432`처럼 로컬에만 바인딩한다. 운영 compose에는 Mailpit과 DB 포트 공개를 넣지 않고, DB 비밀번호는 `.env`로 뺀다. |
| S-5 | `src/app/(app)/settings/alerts/actions.ts:56-60` | 이메일 채널 테스트가 실패하면 `실패: ${err.message}`가 그대로 화면에 나온다. SMTP 호스트·IP·포트(`connect ECONNREFUSED 10.x.x.x:587`)나 인증 실패 사유가 일반 멤버에게 보인다. SMTP 비밀번호 자체는 노출되지 않는다. | **낮음** | 화면에는 "발송 실패"만 보여 주고 상세는 서버 로그에만 남긴다. |
| S-6 | `src/lib/monitor/input.ts:43`<br>`src/lib/monitor/input.ts:9-10` | `channelIds` 배열 길이와 모니터 개수 제한이 없다(상태 페이지는 `.max(100)`이 있다). 멤버가 직접 POST로 거대한 배열을 보내거나 모니터를 수천 개 만들면 DB와 워커에 부하가 걸린다. 모니터 이름의 제어문자도 막지 않는다. | **낮음** | `channelIds`에 `.max(50)` 같은 상한을 둔다. 모니터 이름에는 `/[\u0000-\u001f\u007f]/` 거부 규칙을 추가한다. 팀당 모니터 수 상한을 둔다. |

## 2. 가능성만 있는 것 (코드로 확정하지 못함)

| ID | 위치 | 시나리오 | 심각도 | 수정안 |
|---|---|---|---|---|
| P-1 | `src/app/(auth)/actions.ts:39` | 로그인을 Server Action에서 `auth.api.signInEmail`로 직접 호출한다. Better Auth의 속도 제한이 HTTP 라우터 단계에만 걸려 있다면 이 경로는 제한을 받지 않아 비밀번호 무차별 대입이 가능하다. Better Auth 내부 구현은 확인하지 못했다. `/api/auth/sign-in/email`은 별도다. | 낮음~중간 | `signInAction`에 IP·이메일 기준 자체 제한(실패 횟수 + 지연)을 둔다. 실제 호출로 제한이 걸리는지 먼저 확인한다. |
| P-2 | `src/app/(auth)/actions.ts:46-72` | `/setup`은 사용자가 0명일 때 누구나 첫 관리자가 된다. 서버를 공개한 직후나 DB를 비운 뒤 다른 사람이 먼저 접속하면 관리자 권한을 가져간다.<br>동시 요청 시에도 짧은 시간 member 세션이 존재할 수 있다. 두 요청 모두 삭제되어 실제 권한 상승은 못 봤다. | 낮음 (운영 절차 문제) | 배포 시 `SETUP_TOKEN` 환경변수를 요구하거나, 첫 관리자를 CLI 스크립트로만 만든다. |
| P-3 | `src/lib/mail.ts:26-34` | `secure`가 포트 465일 때만 켜지고 `requireTLS`가 없다. 587에서 중간자가 STARTTLS를 지우면 SMTP 인증정보와 초대 링크가 평문으로 나간다. | 낮음 | 운영에서는 `requireTLS: true`를 쓰거나 465를 쓴다. |
| P-4 | `src/server/status-pages.ts:66-70`<br>`src/app/status/[slug]/page.tsx:34-36` | 정규식을 통과하는 임의 slug마다 `"use cache"` 항목이 생기고 DB 조회가 일어난다(`status-pages.ts:71`의 slug 조회). 인증 없이 요청해 DB를 흔들 수 있다. 없는 slug는 200으로 응답하고 noindex도 없다(HANDOFF에 이미 있는 항목). | 낮음 | 앞단 레이트 리밋을 두고, 없는 slug는 404와 `robots: noindex`를 반환한다. |
| P-5 | `src/lib/notify/message.ts:161, 180, 202` | 모니터 이름의 `*`, `_`, `~`가 굵은 글씨 안에서 서식으로 해석될 수 있다. `<`, `>`, `&`는 이스케이프되고 `<!channel>`도 차단되어 멘션 주입은 없다. | 정보 | 필요하면 `*_~`도 이스케이프한다. |

## 3. 점검 항목별 결과

| 항목 | 결과 |
|---|---|
| 1. `requireUser`/`requireAdmin` 누락 | **누락 없음.** 모든 `actions.ts` 함수가 DB 접근 전에 호출한다. 로그인·`/setup`·초대 수락·로그아웃만 의도적으로 공개다. 모든 `(app)` 페이지도 Suspense 안에서 호출한다. 관리자 전용(`users`, `general`, 초대·삭제·역할 변경)은 `requireAdmin`이다. `(app)/layout.tsx`는 `getCurrentUser`만 쓰지만 페이지가 각각 다시 검사한다. |
| 2. 초대 토큰·`/setup` 우회 | **우회 경로 못 찾음.** 토큰은 32바이트 난수이고 DB에는 SHA-256 해시만 저장한다. 수락은 `UPDATE … WHERE accepted_at IS NULL AND expires_at > now()`로 원자적이라 재사용할 수 없다. 초대 링크는 요청 Host가 아니라 `BETTER_AUTH_URL`로 만들어 Host 헤더 조작이 안 된다. `role`은 `input:false`라 폼으로 올릴 수 없고 DB의 초대 값에서만 정해진다. 공개 가입 경로 `/api/auth/sign-up/email`과 `/`·대소문자·쿼리 변형은 모두 404다(직접 확인). 위험은 P-2(첫 관리자)와 S-4(Mailpit 노출)뿐이다. |
| 3. SSRF | S-1, S-3. `user:pass@`는 요청 자체는 실패하지만 비밀번호가 에러 문자열로 새어 나간다. |
| 4. 공개 상태 페이지 노출 | **문제 없음.** `getPublicStatusPage`는 모니터 `name`, `enabled`, `status`와 일별 집계만 select한다. URL·에러 상세·`lastCheckedAt`은 쿼리에 없다. 모니터 이름에 팀이 URL을 쓰면 그대로 보이는 것은 입력 책임이다. P-4 참고. |
| 5. webhook·SMTP 비밀번호 노출 | UI는 서버 컴포넌트에서 `maskSecret`을 적용하므로 HTML에 전체 URL이 없다. 로그에는 webhook URL이나 `SMTP_PASS`를 찍는 곳이 없다. 발송 에러는 Slack 응답 앞 100자만 포함한다. webhook은 DB에 평문 저장된다(`schema.ts:177`, PLAN에 보류 항목으로 있음). 호스트가 `hooks.slack.com`으로 제한되고 `redirect: "error"`라 webhook 경로의 SSRF는 막혀 있다. 남은 것은 S-5다. |
| 6. 메일 헤더·Slack mrkdwn 주입 | 이메일: 이름에 `\r\nBcc:`를 넣어도 nodemailer가 개행을 공백으로 바꿔 헤더 주입이 안 된다(직접 확인: `Subject: [DOWN] evil Bcc: attacker@evil.com`). 본문은 평문이라 HTML 주입도 없다. 방어 차원에서 S-6의 제어문자 거부를 권장한다. Slack: 이름·URL·원인·채널명 모두 `slackEscape`/`slackLink`/`slackCode`를 거치고 길이 제한도 있어 안전하다(P-5만 서식 문제). |
| 7. zod 누락·raw SQL | raw SQL은 모두 drizzle `sql` 템플릿의 바인딩 파라미터다(`sql.raw` 없음). 인젝션 경로는 못 찾았다. zod 누락은 S-6이다. `users/actions.ts:75, 83`의 `id`는 `z.string().min(1)`이지만 파라미터 바인딩이라 안전하다. |
| 8. 쿠키·세션 | `tz` 쿠키는 `normalizeTimeZone`(길이 64 이하 + Intl 검증)을 거치고 포맷에만 쓰인다. 오프셋 형식(`+01:00`)도 통과하지만 영향은 없다. 세션은 Better Auth 기본값이고 `getSession`을 매번 DB로 확인하므로 역할 변경·사용자 삭제가 즉시 반영된다. `proxy.ts`는 쿠키 유무만 보지만 실제 권한은 각 페이지·액션이 다시 검사한다. `/api/test/*`는 프로덕션에서 공개 목록과 라우트 양쪽에서 막힌다. `BETTER_AUTH_SECRET`은 compose에서 필수 값이다. 명시적 `trustedOrigins`와 `rateLimit` 설정이 없으니 P-1과 함께 확인한다. |

## 처리 현황

- 2026-11-08 수정: **S-3**(URL의 `user:pass@` 거부), **S-4**(compose의 db·Mailpit 포트를 `127.0.0.1`에만 바인딩. 운영용 compose 분리와 DB 비밀번호 `.env` 이동은 남음), **S-5**(이메일 채널 테스트 실패 시 상세 대신 일반 문구), **S-6**(`channelIds` 최대 50개, 모니터 이름 제어문자 거부. 팀당 모니터 수 상한은 남음).
- 2026-11-09 수정: **S-1**(SSRF). 링크로컬·메타데이터 주소는 항상 차단, 사설·루프백 주소는 `MONITOR_ALLOWED_NETWORKS`에 있고 관리자가 저장한 모니터(`allow_private`)에만 허용한다. 연결 시점에 DNS 결과를 검사하고 리다이렉트 홉과 SSL 점검에도 적용한다. 코드: `src/lib/monitor/network.ts`, `safe-fetch.ts`, `target.ts`. 워커 차단은 Docker 스택에서 확인했다(`localhost` 모니터가 "허용되지 않은 주소"로 실패).
- 2026-11-09 수정: **S-2**(이메일 채널 오남용). 이메일 채널 생성은 관리자 전용이고(서버 액션에서 검사, 멤버 화면에서는 선택지를 숨김), 테스트 발송은 채널당 60초에 한 번이다(`alert_channels.last_test_at`를 UPDATE로 원자적으로 선점, 실패한 발송도 횟수에 든다). 기존 이메일 채널은 그대로 두었다. 코드: `src/lib/notify/policy.ts`, `settings/alerts/actions.ts`.
- 2026-11-09 수정: **S-4 나머지**. 운영용 `docker-compose.prod.yml`을 분리했다(DB 비밀번호 등 비밀값은 `.env`에서 필수로 받고, DB 포트·Mailpit 없음, 웹은 `127.0.0.1`에만 게시, 프로젝트명 `pasu`로 볼륨 분리). 개발용 `docker-compose.yml`은 기본 비밀번호 `monitor`를 `${POSTGRES_PASSWORD:-monitor}`로 유지해 `.env` 없이도 뜬다. 격리된 `pasu` 프로젝트로 실제 기동해 확인하고 지웠다.
- 남음: P-1~P-5.
- S-3으로 DB에 이미 들어 있는 `user:pass@` 모니터는 막지 못한다. 필요하면 기존 행을 점검한다.

## 4. 수정 우선순위 제안

_(처리 현황은 위 절 참고. 원래 제안 순서였고, S-1~S-6은 끝났다. 팀당 모니터 수 상한만 남았다.)_

1. P-1: 로그인 속도 제한 동작 확인
2. P-3, P-4 순으로 처리한다.

`docs/HANDOFF.md`의 "미해결" 목록에 있는 SSRF 정책 결정이 S-1과 같은 항목이다.
