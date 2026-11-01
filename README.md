# Simple Monitoring

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
- `.env`의 `DATABASE_URL`, `SMTP_HOST`/`SMTP_PORT`는 무시하고 compose 서비스(`db`, `mailpit`)를 쓴다. 실제 SMTP를 쓰려면 `.env`에 `COMPOSE_SMTP_HOST`, `COMPOSE_SMTP_PORT`를 넣는다.
- 컨테이너 워커 안에서 `localhost`는 워커 자신이다. `http://localhost:3000/...`처럼 호스트 PC를 가리키는 모니터는 Docker 스택에서 down이 된다. 같은 compose의 웹을 체크하려면 `http://web:3000/...`을 쓴다.
- 로컬 dev 서버·워커(`npm run dev`, `npm run worker`)와 동시에 띄우지 않는다. 포트 3000이 충돌하고 같은 DB 볼륨을 쓰므로 워커 두 개가 함께 체크한다.

### 외부에 공개할 때
- HTTPS 리버스 프록시(nginx, Caddy 등) 뒤에 둔다. 웹 컨테이너는 HTTP만 제공한다.
- `BETTER_AUTH_URL`을 실제 주소로 바꾼다(초대 링크와 알림 링크에 쓰인다).
- Postgres 계정이 `docker-compose.yml`에 `monitor/monitor`로 고정돼 있고 5432 포트가 열려 있다. 비밀번호를 바꾸고(`db`의 `POSTGRES_PASSWORD`와 앱의 `DATABASE_URL`을 함께 바꿔야 함) 포트 노출을 없앤다.
