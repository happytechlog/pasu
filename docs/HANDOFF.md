# HANDOFF

_마지막 갱신: 2026-10-31 · 5단계(대시보드) 완료_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드. 목록(`/`)에는 상태 배지, 최근 30회 히트바, 응답시간, 24h 가동률, SSL 남은 일수(7단계 전이라 대부분 "—")가 있다. 상세(`/monitors/[id]?range=24h|7d|30d`)에는 가동률 3종, 응답시간 차트(호버 툴팁, 실패/공백 구간 띠), 장애 이력 20건, 최근 체크 30건이 있다. 두 화면 모두 30초마다 `router.refresh()`로 갱신된다.
- typecheck, lint, build, test(73개) 통과. 브라우저로 목록·상세(3개 기간)·호버·자동 갱신(이동 없이 체크 수 증가)·DOWN 배지 전환을 확인했다.
- 로컬 DB에 테스트 데이터가 있다: 관리자 `admin@example.com` / `password1234`, 모니터 3개(Example, 실패 테스트 → `/api/test/fail?status=503`, 히스토리 데모 → 30일치 합성 체크 8,640건과 장애 2건, SSL 만료 10일 후로 임의 설정). 필요 없으면 지운다.

## 다음 할 일: 6단계 알림
- `/settings/alerts`에서 Slack webhook·이메일 채널 CRUD(webhook은 끝 4자리만 표시), "테스트 발송" 버튼. 헤더 메뉴에 "알림채널"을 추가한다.
- 발송 코드는 `src/lib/notify/`(slack, email; `src/lib/mail.ts` 재사용). 워커의 `checkOne`(`worker/index.ts`)에서 `out.event`(`"down"` | `"recovered"`)일 때 모니터에 연결된 활성 채널로 보낸다. 메시지 형식은 PLAN.md의 "알림 메시지 예"를 따른다.
- 발송 실패가 체크 기록이나 상태 전이를 막으면 안 된다(트랜잭션 밖에서 보내고 에러는 로그만).

## 미해결·결정 필요
- 장애 중 일시정지 → 재개 → 다시 down이면 같은 장애로 보고 `event`를 null로 만든다(중복 알림 방지, 4단계에서 구현됨).
- `/api/health`는 공개 상태다. 비밀번호 재설정 기능은 없다.
- 차트 버킷의 평균은 성공한 체크만 포함한다. 버킷 전체가 실패면 선이 끊기고 아래 띠가 빨간색이 된다.

## 알아둘 것
- **Windows에서 `TaskStop`은 자식 프로세스를 남긴다.** `npm run dev`는 3000번을 계속 점유하고, `npm run worker:start`의 tsx 프로세스도 계속 체크를 돈다. 멈춘 뒤 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`로 `simple_monitoring` 명령줄을 가진 프로세스를 찾아 종료한다.
- `npm run build` 후 열려 있던 페이지에서 dev 서버로 Server Action을 보내면 "Failed to find Server Action"이 난다. 페이지를 새로 열면 된다.
- Next 16은 방문한 페이지를 숨긴 채 DOM에 남긴다(Activity). 브라우저 테스트에서는 보이는 요소만 고른다. Aside REPL은 호출마다 새 세션이라 `listBrowserTabs()` → `attachBrowserTab()`으로 다시 붙고, 스크린샷은 `./artifacts/`(세션 폴더)에만 저장된다.
- `/api/test/*`는 개발 환경에서만 공개되고, 프로덕션 빌드에서는 정적 404다.
- 선점 시 `nextCheckAt = now + interval`로 미리 밀어 두므로 체크 간격이 일정하고 워커 여러 개도 안전하다.
