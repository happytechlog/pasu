# HANDOFF

_마지막 갱신: 2026-10-31 · 1단계(뼈대) 완료_

## 현재 상태
- 동작함: `docker compose up -d --wait` → `npm run dev`를 실행하면 `/`에 "데이터베이스: 연결됨"이 표시되고, `/api/health`는 200을 반환한다. `npm run worker:start`는 DB 연결만 확인한다.
- DB: 마이그레이션 `0000` 적용 완료(monitors, checks, incidents, alert_channels, monitor_alert_channels). auth 테이블은 아직 없다.
- typecheck, lint, build 통과. 테스트 파일은 아직 없다.

## 다음 할 일: 2단계 인증
`docs/PLAN.md`의 2단계 범위를 따른다. 시작 전에 확인할 것:
- Better Auth와 Next 16 연동 방식. `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`를 먼저 읽는다(cacheComponents 환경에서 세션 읽기는 Suspense 안에서 해야 함).
- Better Auth의 Drizzle 어댑터로 auth 스키마를 생성하고, `npm run db:generate`로 마이그레이션을 만든다.
- 경로 보호 방식. Next 16에서 middleware 이름과 API가 바뀌었을 수 있으니 문서를 확인한다.

## 알아둘 것
- Next 16 + `cacheComponents`: `export const dynamic`은 에러가 난다. 자세한 내용은 CLAUDE.md
- 개발 중 git 작성자는 PC 전역 설정(`happytechlog`)으로 기록되고 있다. 사용자에게 변경 여부를 안내했다.
