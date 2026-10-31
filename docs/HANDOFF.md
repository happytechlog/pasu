# HANDOFF

_마지막 갱신: 2026-10-31 · 4단계(워커) 완료_

## 현재 상태
- 동작함: 인증(2단계), 모니터 CRUD(3단계), 워커(`npm run worker`). 워커는 10초마다 due 모니터를 선점해 체크하고, `checks`에 저장한 뒤 상태를 바꾸고 `incidents`를 연다/닫는다. 다운·복구는 지금은 **콘솔 로그로만** 남는다(`DOWN 이름 — URL · 원인: HTTP 503`, `UP 이름 복구 — 다운 시간 N분`).
- DB: 마이그레이션 `0003` 적용(열린 incident 모니터당 1건 부분 유니크 인덱스, due 조회 인덱스). 로컬 DB의 사용자·모니터·채널은 0건이다.
- typecheck, lint, build, test(66개) 통과. 실제 워커로 E2E 27개 항목을 확인했다(정상/HEAD/503/타임아웃/301 기대/DNS 실패/일시정지/재개 후 중복 방지/복구/pending→up 정리). 스크립트는 커밋하지 않음.

## 다음 할 일: 5단계 대시보드
- `/` 목록에 응답시간, 24h 가동률, 최근 체크 히트바, SSL 남은 일수를 추가한다. 상세 `/monitors/[id]`에는 응답시간 차트(24h/7d/30d), 가동률, 장애 이력을 넣는다. 30초 폴링(`router.refresh()` 또는 `refresh()`)을 쓴다.
- 쿼리는 `checks_monitor_checked_at_idx`(monitor_id, checked_at)를 탄다. 30일 차트는 원본 그대로 그리면 1분 간격일 때 43,200점이므로 SQL에서 버킷 집계(`date_bin`)를 한다.
- 가동률 정의를 정한다(ok 체크 비율 vs incident 기간 기준). `checks` 기준이 가장 간단하다.

## 미해결·결정 필요
- 다운 판정 후 알림은 6단계에서 `worker/index.ts`의 `checkOne` 안 `out.event` 자리에 붙인다(`"down"` | `"recovered"`). 장애 중 일시정지 → 재개 → 다시 down이면 같은 장애로 보고 `event`를 null로 만든다(중복 알림 방지).
- `/api/health`는 공개 상태다. 비밀번호 재설정 기능은 없다.
- 3xx를 기대값에 넣으면 리다이렉트를 따라가지 않는다(`redirect: "manual"`). 그 외에는 따라간 뒤 최종 상태코드로 판정한다.

## 알아둘 것
- 선점할 때 `nextCheckAt = now + interval`로 미리 밀어 둔다. 그래서 체크가 오래 걸려도 간격이 일정하고, 워커를 여러 개 띄워도 같은 모니터를 중복으로 체크하지 않는다. 결과를 기록할 때는 모니터 행을 다시 잠그고 읽으므로, 체크 도중의 일시정지·삭제가 우선한다.
- `/api/test/*`는 개발 환경에서만 공개(`proxy.ts`)되고, 프로덕션 빌드에서는 정적 404로 프리렌더된다.
- Windows에서 `child.kill("SIGINT")`는 강제 종료라서 워커의 graceful shutdown은 Windows에서 확인하지 못했다(Docker/Linux에서 9단계 때 확인).
- `TaskStop`으로 `npm run start`를 멈춰도 `next start` node 프로세스가 남아 3000번을 계속 점유할 수 있다. 서버 동작이 이상하면 3000번을 쓰는 프로세스부터 확인한다.
- Next 16은 방문한 페이지를 숨긴 채 DOM에 남긴다(Activity). 그래서 브라우저 테스트에서는 보이는 요소만 골라야 한다. Aside 브라우저는 `confirm()`을 바로 true로 처리한다.
- JS 없는 POST에서 `useActionState`의 결과는 RSC 페이로드(`self.__next_f`)에만 들어간다.
