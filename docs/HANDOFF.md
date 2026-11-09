# HANDOFF

_마지막 갱신: 2026-11-09 · 10단계(시간대) 뒤 코드 리뷰 3건과 보안 점검(`docs/SECURITY-REVIEW.md`) 중 S-1~S-6까지 반영함_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지, 체크 보관 기간·알림 시간대 설정, Docker 스택(`migrate` → `web` + `worker`).
- 시간대: 웹은 `tz` 쿠키(`getViewerTimeZone()`), 이메일은 `/settings/general`의 알림 시간대, Slack은 `<!date>` 토큰. 일별 집계·공개 페이지 90일 막대·차트 버킷 기준점은 KST 고정.
- 보안 수정: S-3~S-6(커밋 8ab62c0: URL `user:pass@` 거부, 이름 제어문자 거부, `channelIds` 최대 50개, db·Mailpit 포트 `127.0.0.1` 바인딩, 이메일 테스트 실패 상세 숨김). S-1(커밋 c546586): 링크로컬·메타데이터 주소는 항상 차단, 사설·루프백 주소는 `allow_private` 모니터이면서 `MONITOR_ALLOWED_NETWORKS`(CIDR, 기본 빈 값) 안일 때만 허용. 사설 주소를 가리키는 URL은 관리자만 저장 가능. 구조는 CLAUDE.md의 "접속 대상 정책". S-2(커밋 98bdaa0): 이메일 채널은 관리자만 생성(멤버 화면에서 선택지 숨김), 테스트 발송은 채널당 60초에 한 번(`alert_channels.last_test_at`, 마이그레이션 0009). 기존 이메일 채널은 그대로.
- typecheck, lint, build, worker:build, test(175개) 통과. Docker 스택을 새 이미지로 띄워(마이그레이션 0008·0009 적용) `localhost` 모니터가 "허용되지 않은 주소"로 실패하고 공개 모니터는 그대로 up인 것을 확인했다. **웹 화면에서 등록 검사(비관리자 거부, 관리자 허용, 메타데이터 거부)는 확인하지 못했다**(Chrome 확장이 연결되지 않았음). 판단 로직은 `target.test.ts`·`policy.test.ts`가 다룬다. S-2의 화면 동작(멤버에게 이메일 선택지 숨김, 서버 거부, 쿨다운 메시지)도 브라우저로는 못 봤다. 쿨다운 선점 SQL만 psql(롤백 트랜잭션)로 확인했다.
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 상태 페이지 `acme-status`. 지금 Docker 스택이 실행 중이다.

## 다음 할 일
- 웹에서 한 번 확인한다: 멤버로 알림채널 화면에 이메일 선택지가 없는지, "테스트 발송"을 연달아 눌렀을 때 60초 안내가 나오는지(로컬 채널은 실제 Slack/메일로 나가니 채널 하나만 쓴다). 관리자로 `http://169.254.169.254/` 저장(거부), `.env`에 `MONITOR_ALLOWED_NETWORKS=127.0.0.0/8,::1/128`을 넣고 스택 재시작 후 `http://localhost:3000/api/health` 저장(허용, 모니터 up), 멤버로 같은 URL 저장(거부).
- 보안 남은 항목을 사용자와 정한다: P-1(로그인 속도 제한이 Server Action 경로에도 걸리는지 실제 호출로 확인), P-2~P-5.
- `PLAN.md`의 "보류·나중에 정할 것"(배포 위치, webhook 암호화, 키워드 체크, 점검 시간)도 남아 있다.

## 미해결·결정 필요
- **기존 모니터는 모두 `allow_private=false`다.** 사설 주소를 가리키던 모니터(로컬의 "실패 테스트" = `localhost:3000`)는 차단 상태로 실패한다. 쓰려면 `.env`에 허용 대역을 넣고 관리자가 다시 저장한다. S-3은 새 입력만 막는다(DB에 이미 `user:pass@` URL이 있는지 점검 안 함). S-4는 운영용 compose 분리와 DB 비밀번호 `.env` 이동이 남음. S-6은 팀당 모니터 수 상한이 남음.
- 멤버가 이름이 사설 주소로 풀리는지 여부를 등록 오류 메시지로 알 수 있다(boolean 한 비트의 정찰). 감수했다.
- 워커: 한 틱이 최대 200개를 선점해 배치가 끝날 때까지 다음 선점을 못 한다. SIGTERM 종료 대기에 기한이 없어 `docker stop` 10초를 넘기면 SIGKILL.
- 공개 페이지: **down 상태로 비활성화한 모니터가 "일시정지"로 보여 장애가 가려진다**(정책 결정 필요). 워커가 죽으면 오래된 `up`이 계속 초록(`lastCheckedAt` 기준 "확인 중" 처리 필요). 없는 slug는 HTTP 200·noindex 없음.
- 사소: 가동률 `floor(pct*100)/100` 부동소수점 오차(`stats.ts`), `describeFetchError`에 `EHOSTUNREACH` 등 매핑 없음, "90일 전" 라벨이 실제 89일 전, `MonitorRow`의 `key={i}`, 푸터 `now`와 쿼리의 `today`가 따로, 일별 통계 쿼리가 raw SQL.
- 기존: 사용자별 시간대 고정 없음, 6시간 차트 버킷은 KST 자정 기준, 보관 기간 30일 미만이면 30일 차트에 빈 구간, 알림 재시도 없음, 채널 수정 화면·비밀번호 재설정 없음.

## 알아둘 것
- 워커의 외부 요청은 `fetchFor(allowPrivate)`(`safe-fetch.ts`)와 `fetchCertExpiry(url, ms, policyFor(...))`만 쓴다. 맨 `fetch`/`tls.connect`를 새로 쓰면 SSRF 방어가 빠진다. `localhost`는 `::1`과 `127.0.0.1`로 모두 풀리고 하나라도 허용 밖이면 실패하므로 둘 다 허용 목록에 넣는다.
- `"use cache"` 함수는 인자를 캐시 키로 쓴다. 요청마다 달라지는 값(`now` 등)을 인자로 넘기지 말고 안에서 만든다. `expire`가 5분 미만이면 빌드 때가 아니라 요청 시점에 실행된다.
- `ActionForm`은 제출 후 폼을 리셋하는데 `<select>`의 `defaultValue`는 다시 적용되지 않는다. 저장값이 바뀌는 select에는 `key={값}`을 준다.
- `Intl.supportedValuesOf("timeZone")`에는 `UTC`가 없다. `allTimeZones()`가 앞에 붙인다.
- Slack 앱 webhook은 `username`/`icon_emoji`를 무시한다. 로컬 `.env`의 `SMTP_FROM`이 코드 기본값보다 우선한다. 로컬 SMTP·Slack 채널은 실제 서비스라 테스트 중 알림이 실제로 나간다(채널 없는 모니터로 확인).
- dev와 Docker 스택을 동시에 띄우지 않는다. 같은 브랜치에서 여러 세션이 작업할 땐 `git add <파일>`로만 커밋한다. Git Bash heredoc과 PowerShell 5.1 인자는 한글·큰따옴표를 깨뜨린다. 파일은 Write로 만들고 커밋 메시지는 `git commit -F 파일`로 쓴다.
