# HANDOFF

_마지막 갱신: 2026-10-31 · 2단계(인증) 완료_

## 현재 상태
- 동작함: 사용자 0명이면 `/login`이 `/setup`으로 보낸다 → 첫 관리자 생성 → `/settings/users`에서 초대 메일 발송(Mailpit에서 확인) → `/invite/[token]`에서 가입 → 로그인·로그아웃. 비로그인 상태로 보호 경로에 접근하면 `/login?next=...`로 이동하고, `/api/*`는 401을 반환한다.
- DB: 마이그레이션 `0001_auth` 적용(user/session/account/verification/invitations, `monitors.created_by` FK). 로컬 DB의 사용자는 0명이다(테스트 데이터 삭제함).
- typecheck, lint, build, test(safe-next 11개) 통과. 인증 흐름 E2E 20개 항목을 JS 없는 폼 POST로 확인했다(스크립트는 커밋하지 않음).

## 다음 할 일: 3단계 모니터 CRUD
- `(app)` 그룹 아래에 페이지를 만든다. 페이지 데이터는 Suspense 안에서 `requireUser()`, 액션 첫 줄에서도 `requireUser()`를 호출한다.
- 생성 시 `createdBy: user.id`를 넣는다. 알림 채널 선택 UI는 채널이 6단계에서 생기므로 비어 있을 수 있다.
- 폼은 `src/components/action-form.tsx` + zod 패턴을 재사용한다. select는 아직 네이티브 `<select>`를 쓴다(base-ui Select는 아직 추가하지 않음).

## 미해결·결정 필요
- `/api/health`는 Docker 헬스체크용으로 **공개**로 두었다(CLAUDE.md의 "보호 경로" 목록과 다름. DB 연결 여부만 노출).
- 비밀번호 재설정 기능이 없다. 지금은 관리자가 사용자를 삭제하고 다시 초대해야 한다.
- 관리자는 자기 자신을 강등하거나 삭제할 수 없다. 그래서 관리자가 최소 1명은 항상 남는다.

## 알아둘 것
- 사용자의 dev 서버가 3000번에서 이미 돌고 있을 수 있다. 두 번째 `npm run dev`는 종료된다.
- `.env`의 `BETTER_AUTH_SECRET`이 비어 있었다. 로컬 `.env`에는 임의 값을 채워 넣었다.
- 헤더에도 폼(로그아웃)이 있으므로 페이지의 첫 `<form>`이 로그아웃 폼이다(스크립트로 테스트할 때 주의).
- Better Auth 1.7: `getSession`은 매 요청 DB를 조회한다(cookieCache 꺼짐). 그래서 권한 변경이 즉시 반영된다.
