# HANDOFF

_마지막 갱신: 2026-10-31 · 7단계(SSL) 완료_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인. 워커는 60초마다 24시간 안에 확인하지 않은 켜진 https 모니터의 인증서 만료일을 읽어 `sslExpiresAt`에 저장하고(대시보드 "SSL 남은 일수"), 14/7/1일 임계값에 들면 한 번 알린다(`ssl_alerts_sent`). 로그: `ssl <이름>: expires … (Nd left)`, `ssl lookup failed …`.
- typecheck, lint, build, test(92개) 통과. 실제로 확인한 것: expired.badssl.com → "인증서가 만료되었습니다" 메일 1회, 5일짜리 자체 서명 인증서(로컬 TLS 서버) → 7일 임계값 메일 1회, 다시 확인해도 재발송 없음, 연결 거부/DNS 실패 메시지와 약 1시간 뒤 재시도, URL을 바꾸면 SSL 값 초기화(같은 URL 저장 시 유지).
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 모니터 4개(실패 테스트 = `/api/health`, Example, 히스토리 데모, SSL 만료 테스트 = expired.badssl.com, 운영팀 메일에 연결), 채널 2개(운영팀 Slack = 가짜 webhook, 운영팀 메일).

## 다음 할 일: 8단계 공개 상태 페이지
- `status_pages`(slug 유니크, 제목), `status_page_monitors` 테이블과 마이그레이션. `/settings/status-pages`에서 만들고 모니터를 고른다.
- `/status/[slug]`는 로그인 없이 열린다(`proxy.ts`의 `PUBLIC_PREFIXES`에 이미 `/status` 있는지 확인). 현재 상태 + 90일 일별 가동률 막대. **URL과 에러 상세는 절대 내보내지 않는다** — 조회 쿼리에서 아예 select하지 않는다.
- 주의: `checks` 보관 기간이 30일(`CHECK_RETENTION_DAYS`)이라 90일 막대는 원시 checks만으로 채울 수 없다. 일별 집계 테이블을 둘지, 보관 기간을 넘는 날은 "데이터 없음"으로 둘지 먼저 정한다.

## 미해결·결정 필요
- 알림 발송 실패 시 재시도·기록이 없다(로그만). SSL 알림은 `ssl_alerts_sent`에 먼저 기록하므로 발송이 실패해도 다시 보내지 않는다.
- SSL은 만료일만 본다. 자체 서명·호스트 불일치는 알리지 않는다(HTTP 체크가 실패로 잡음).
- 채널 수정 화면 없음. `/api/health`는 공개. 비밀번호 재설정 없음. 실제 Slack 발송은 미확인(진짜 webhook 없음).

## 알아둘 것
- Windows에서 `TaskStop`은 자식 프로세스(next dev, tsx 워커)를 남긴다. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`로 `simple_monitoring` 명령줄을 확인하고 PID로 종료한다.
- 워커 시작 직후 HTTP 체크와 SSL 선점이 같은 행을 잡으면 SSL 쪽이 `SKIP LOCKED`로 건너뛰고 다음 60초 루프에 처리한다(정상).
- 클라이언트 컴포넌트가 `actions.ts`를 직접 import하면 dev에서 새로고침 루프가 생긴다(CLAUDE.md 참고).
- Aside REPL: 호출마다 `listBrowserTabs()`→`attachBrowserTab()`으로 다시 붙는다. `getByLabel`/`getByRole`은 되고 `.nth()`는 안 된다.
- 알림 상세 링크의 기준 URL은 `APP_URL`, 없으면 `BETTER_AUTH_URL`이다.
