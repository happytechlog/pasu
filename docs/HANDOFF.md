# HANDOFF

_마지막 갱신: 2026-10-31 · 3단계(모니터 CRUD) 완료_

## 현재 상태
- 동작함: 인증 전체(2단계). `/`에 모니터 목록이 있다(상태 배지 대기/정상/장애/일시정지, 간격, 마지막 체크). `/monitors/new`와 `/monitors/[id]/edit`에서 추가·수정하고, 목록에서 일시정지·재개·삭제한다. 삭제는 수정 화면에서도 할 수 있고, `confirm()`으로 한 번 확인한다.
- DB: 마이그레이션 `0002`에서 `monitors.expected_status`(text, 기본 `2xx`)를 추가했다. 로컬 DB의 사용자·모니터·채널은 0건이다(E2E 후 정리함).
- typecheck, lint, build, test(47개) 통과. 인증 포함 E2E 28개 항목을 JS 없는 폼 POST로 확인했고, Aside 브라우저(`aside repl`)로도 화면 동작을 확인했다(에러 시 입력 유지, 추가·수정·채널·일시정지·삭제·404·로그아웃 보호). 스크립트는 커밋하지 않음.

## 다음 할 일: 4단계 워커
- `worker/index.ts`: 10초마다 `enabled AND nextCheckAt <= now`인 모니터를 조회하고, 동시성 20으로 체크한다. `timeoutMs`, `method`, `expectedStatus`를 사용한다.
- 성공 판정은 `src/lib/monitor/expected-status.ts`의 `matchesExpectedStatus(spec, code)`로 한다. 판정·상태 전이는 순수 함수로 `src/lib/monitor/`에 두고 Vitest로 테스트한다.
- 체크 후 `nextCheckAt = now + intervalSec`, `lastCheckedAt`, `consecutiveFailures`, `status`를 갱신한다.
- 실패 확인용 `/api/test/fail`(개발 환경 전용)을 만든다. `proxy.ts`가 `/api/*`에 401을 주므로 `PUBLIC_PREFIXES`에 추가하거나 다르게 처리해야 한다.

## 미해결·결정 필요
- 일시정지할 때 열린 `incidents`는 그대로 둔다. 재개하면 `status=pending`, `consecutiveFailures=0`이 된다. 워커는 **pending→up일 때 열린 incident가 있으면 닫아야 한다**(pending→down일 때 incident를 중복으로 열지 않게 주의).
- 수정·재개하면 `nextCheckAt=now`가 되어 바로 다시 체크된다.
- `/api/health`는 공개 상태다. 비밀번호 재설정 기능은 없다(2단계와 같음).
- URL은 http/https만 허용하고 내부 주소(localhost 등)도 허용한다(팀 내부 도구라서 SSRF 제한을 두지 않음).

## 알아둘 것
- **JS 없는 POST에서는 `useActionState`의 결과(에러, 입력값)가 SSR HTML이 아니라 RSC 페이로드(`self.__next_f`)에만 들어간다.** 스크립트로 확인할 때는 페이로드 문자열을 검사한다.
- Next 16은 방문한 페이지를 숨긴 채 DOM에 남긴다(Activity). 그래서 `/monitors/new`와 수정 폼이 함께 있으면 `id="name"` 등이 중복된다. 브라우저 테스트에서 `querySelector('#name')`이나 체크박스 개수를 셀 때 보이는 요소만 골라야 한다. 라벨 클릭은 실제로 확인했을 때 정상이었다.
- Aside 브라우저는 `confirm()`을 창 없이 바로 true로 처리한다. 취소 경로는 `window.confirm = () => false`로 바꿔서 확인한다.
- `MonitorForm`은 에러가 나면 제출값을 `state.values`로 받고, 필드를 `key`로 다시 마운트해 입력을 유지한다(React가 액션 후 폼을 리셋하기 때문).
- Suspense 안에서 `notFound()`를 호출하면 상태코드는 200이고 404 화면만 스트리밍된다.
- 헤더에 로그아웃 폼이 있으므로 페이지의 첫 `<form>`은 로그아웃 폼이다. 알림 채널 UI는 6단계에서 만든다. 지금은 DB에 직접 넣어야 체크박스가 보인다.
