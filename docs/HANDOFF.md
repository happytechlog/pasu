# HANDOFF

_마지막 갱신: 2026-10-31 · 6단계(알림) 완료_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림. `/settings/alerts`(헤더 "알림채널", 로그인한 누구나)에서 Slack webhook·이메일 채널을 추가·켜기/끄기·삭제하고 테스트 발송한다. webhook은 `••••WXYZ`처럼 끝 4자리만 보이며 전체 URL은 클라이언트로 보내지 않는다. 워커는 down/recovered 때 모니터에 연결된 켜진 채널로 보낸다(`alert sent|failed: …` 로그).
- typecheck, lint, build, test(83개) 통과. 실제로 확인한 것: 채널 추가, 잘못된 Slack URL 거부, 테스트 발송(이메일 → Mailpit 도착, 가짜 Slack → "실패: Slack 응답 404: no_team" 표시), 복구 알림("다운 시간 24분"), 다운 알림(원인·감지 시각·상세 링크), 꺼진 채널에는 미발송, Slack 실패가 상태 전이에 영향 없음.
- **실제 Slack 발송은 확인하지 못했다**(진짜 webhook이 없음). 요청 형식은 `slack.test.ts`에서 fetch 목으로 검증했다. 진짜 webhook으로 "테스트 발송" 한 번 눌러 보면 된다.
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 모니터 3개(실패 테스트는 지금 `/api/health`를 보고 있음), 채널 2개(운영팀 Slack = 가짜 webhook, 운영팀 메일 = ops@example.com, 둘 다 실패 테스트에 연결됨).

## 다음 할 일: 7단계 SSL
- 워커에서 하루 1회 https 모니터의 인증서 만료일을 `tls.connect`로 조회해 `monitors.sslExpiresAt`/`sslCheckedAt`에 저장한다(대시보드는 이미 이 값을 표시함). 순수 판정 로직은 `src/lib/monitor/ssl.ts`에 두고 테스트한다.
- 14/7/1일 전에 한 번씩 알린다. 중복 방지는 `ssl_alerts_sent` 테이블(모니터, 만료일, 임계값 유니크)로 하고 마이그레이션을 만든다. 인증서가 갱신되면 만료일이 바뀌므로 자연히 다시 알릴 수 있다.
- 알림 문구는 `src/lib/notify/message.ts`의 `AlertEvent`에 `ssl` 종류를 추가하고 `notifyMonitorEvent`를 재사용한다. 테스트는 https://expired.badssl.com 등.

## 미해결·결정 필요
- 알림 발송 실패 시 재시도·기록이 없다(로그만). 필요하면 나중에 `alert_log` 테이블.
- 채널 수정(이름·대상 변경) 화면은 없다. 삭제 후 다시 추가한다.
- `/api/health`는 공개 상태다. 비밀번호 재설정 기능은 없다.

## 알아둘 것
- Windows에서 `TaskStop`은 자식 프로세스(next dev, tsx 워커)를 남긴다. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`로 `simple_monitoring` 명령줄을 확인하고 PID로 종료한다.
- 클라이언트 컴포넌트가 `actions.ts`를 직접 import하면 dev에서 새로고침 루프가 생긴다(CLAUDE.md 참고). 증상은 dev 로그에 `Compiled in 1ms` + 같은 GET이 1초마다 반복되는 것.
- Aside REPL: 호출마다 새 세션이라 `listBrowserTabs()`→`attachBrowserTab()`으로 다시 붙는다. `closeTab()`이 실제로 탭을 닫지 못할 수 있고, 창이 백그라운드면 스크린샷이 시간 초과된다. `getByLabel`/`getByRole`은 되고 `.nth()`는 안 된다.
- 알림 상세 링크의 기준 URL은 `APP_URL`, 없으면 `BETTER_AUTH_URL`이다.
