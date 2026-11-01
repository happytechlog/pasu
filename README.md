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
- 외부에서 접속한다면 `BETTER_AUTH_URL`을 실제 주소로 바꾼다(초대 링크와 알림 링크에 쓰인다).
