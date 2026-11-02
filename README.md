# 파수 (Pasu)

UptimeRobot과 비슷한 웹사이트 가동 모니터링 서비스. Next.js 웹 + 상시 실행 워커 + PostgreSQL.

## 로컬 개발

```bash
docker compose up -d --wait   # Postgres + Mailpit(http://localhost:8025)
cp .env.example .env          # BETTER_AUTH_SECRET 채우기
npm install
npm run db:migrate
npm run dev                   # http://localhost:3000 → /setup 에서 첫 관리자 생성
npm run worker
```

## Docker로 전체 실행

```bash
cp .env.example .env          # BETTER_AUTH_SECRET 필수
docker compose --profile app up -d --build --wait
```

- `migrate`(1회 실행) → `web`(http://localhost:3000, `WEB_PORT`로 변경) + `worker` 순서로 뜬다.
- 이미지는 `Dockerfile` 하나에서 타깃 두 개로 만든다.
  - `web`: Next.js standalone(`node server.js`). `/api/health`로 healthcheck한다.
  - `worker`: esbuild 번들(`node index.mjs`, node_modules 없음). 같은 이미지가 `node migrate.mjs`로 마이그레이션도 실행한다.
- `.env`의 `DATABASE_URL`은 무시하고 compose의 `db` 서비스를 쓴다. `SMTP_HOST`/`SMTP_PORT`는 `.env` 값을 그대로 쓰고, 비어 있으면 compose의 `mailpit`(1025)을 쓴다. 컨테이너 안에서 `localhost`는 컨테이너 자신이므로 Mailpit으로 보내려면 `SMTP_HOST=mailpit`으로 쓰거나 줄을 지운다.
- 컨테이너 워커 안에서 `localhost`는 워커 자신이다. `http://localhost:3000/...`처럼 호스트 PC를 가리키는 모니터는 Docker 스택에서 down이 된다. 같은 compose의 웹을 체크하려면 `http://web:3000/...`을 쓴다.
- 로컬 dev 서버·워커(`npm run dev`, `npm run worker`)와 동시에 띄우지 않는다. 포트 3000이 충돌하고 같은 DB 볼륨을 쓰므로 워커 두 개가 함께 체크한다.

### 외부에 공개할 때
- HTTPS 리버스 프록시(nginx, Caddy 등) 뒤에 둔다. 웹 컨테이너는 HTTP만 제공한다.
- `BETTER_AUTH_URL`을 실제 주소로 바꾼다(초대 링크와 알림 링크에 쓰인다).
- Postgres 계정이 `docker-compose.yml`에 `monitor/monitor`로 고정돼 있고 5432 포트가 열려 있다. 비밀번호를 바꾸고(`db`의 `POSTGRES_PASSWORD`와 앱의 `DATABASE_URL`을 함께 바꿔야 함) 포트 노출을 없앤다.

## 알림 설정

모니터가 다운되거나(연속 2회 실패) 복구되면, 그리고 SSL 인증서 만료 14·7·1일 전에 그 모니터에 연결된 채널로 알림을 보낸다. 알림 문구 예:

```
🔴 [DOWN] API 서버 — https://api.example.com · 원인: HTTP 503 · 14:03 감지
🟢 [UP] API 서버 복구 — 다운 시간 12분
⚠️ [SSL] API 서버 — 인증서가 7일 후 만료됩니다 (2026-11-07)
```

각 문구 뒤에는 모니터 상세 페이지 링크가 붙는다(`BETTER_AUTH_URL` 기준).

### 1. 이메일 발송 서버(SMTP) 설정
이메일 알림과 초대 메일은 `.env`의 SMTP 설정으로 보낸다. 기본값은 로컬 Mailpit이라 실제로 발송되지 않고 http://localhost:8025 에서만 보인다.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=앱-비밀번호
SMTP_FROM="Pasu Monitor <alerts@example.com>"
```

- 로컬 실행(`npm run dev`, `npm run worker`)과 Docker 스택이 같은 `.env` 값을 쓴다.
- 포트 465면 처음부터 TLS로 연결하고, 그 밖의 포트(587 등)는 서버가 지원하면 STARTTLS로 전환한다.
- `SMTP_USER`가 비어 있으면 인증 없이 보낸다(Mailpit용).
- Gmail은 계정에 2단계 인증을 켜고 **앱 비밀번호**를 만들어 `SMTP_PASS`에 넣는다. 일반 비밀번호로는 로그인되지 않는다. `SMTP_FROM` 주소는 로그인한 계정과 같게 둔다.
- `.env`를 바꾸면 웹과 워커를 재시작해야 반영된다. Docker는 `docker compose --profile app up -d --wait`를 다시 실행하면 바뀐 컨테이너만 새로 만든다.

### 2. Slack Incoming Webhook 발급
1. https://api.slack.com/apps 에서 **Create New App → From scratch**로 앱을 만들고 워크스페이스를 고른다.
2. 왼쪽 메뉴 **Incoming Webhooks**에서 기능을 켠다.
3. **Add New Webhook to Workspace**를 눌러 알림을 받을 채널을 고르고 허용한다.
4. 생성된 `https://hooks.slack.com/services/...` URL을 복사한다. 이 URL만 있으면 누구나 그 채널에 글을 쓸 수 있으니 외부에 공유하지 않는다.

메시지는 발신자 이름 `PasuMonitor`(아이콘 🛡️)로 보내고, 제목 줄 아래에 상태 색 막대와 감지 시각·확인한 URL·원인, "모니터 보기" 버튼을 붙인다.
- 앱 디렉터리의 예전 **Incoming WebHooks** 연동으로 만든 webhook은 이 이름과 아이콘이 그대로 적용된다.
- 위 방법처럼 Slack 앱으로 만든 webhook은 Slack이 이름·아이콘 지정을 무시하고 앱 이름을 쓴다. 앱 설정의 **Basic Information → Display Information**에서 이름을 `PasuMonitor`로 바꾼다.

### 3. 알림 채널 등록 (`/settings/alerts`, 상단 메뉴 "알림채널")
- 로그인한 팀원 누구나 채널을 추가·끄기·삭제할 수 있고, 채널은 팀 전체가 함께 쓴다.
- **종류**(Slack 또는 이메일), **이름**, **대상**(webhook URL 또는 이메일 주소)을 넣고 "채널 추가"를 누른다. Slack은 `https://hooks.slack.com/services/`로 시작하는 URL만 받는다.
- 목록의 **테스트 발송**으로 바로 시험 메시지("[테스트] 알림 채널 확인")를 보내 본다. 실패하면 원인(예: `Slack 응답 404: no_team`, SMTP 오류)이 화면에 표시된다.
- 등록한 webhook URL은 화면에 끝 4자리만 보인다. 수정 화면은 없으므로 URL을 바꾸려면 채널을 삭제하고 다시 만든다.
- **끄기**를 하면 연결은 유지된 채 발송만 멈춘다.

### 4. 모니터에 채널 연결
모니터 추가·수정 화면의 **알림 채널** 체크박스에서 알림을 받을 채널을 고른다. **채널을 등록만 하고 모니터에 연결하지 않으면 알림이 가지 않는다.** 알림채널 목록의 "연결된 모니터" 수로 연결 여부를 확인할 수 있다.

### 발송 실패 시
발송 실패는 재시도하지 않고 워커 로그에만 남는다(`alert failed: <모니터> → <채널> (...)`, Docker는 `docker compose logs worker`). 한 채널이 실패해도 다른 채널 발송과 체크 기록에는 영향이 없다.
