# HANDOFF

_마지막 갱신: 2026-11-08 · 10단계(시간대) 뒤 코드 리뷰 3건과 보안 점검(`docs/SECURITY-REVIEW.md`) 중 쉬운 항목(S-3~S-6)까지 반영함_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지, 체크 보관 기간·알림 시간대 설정, Docker 스택(`migrate` → `web` + `worker`).
- 시간대: 웹은 `tz` 쿠키(`getViewerTimeZone()`), 이메일은 `/settings/general`의 알림 시간대, Slack은 `<!date>` 토큰. 일별 집계·공개 페이지 90일 막대·차트 버킷 기준점은 KST 고정.
- 보안 수정(커밋 8ab62c0): 모니터 URL의 `user:pass@` 거부, 이름 제어문자 거부, `channelIds` 최대 50개, compose의 db(5432)·Mailpit(1025/8025) 포트를 `127.0.0.1`에만 바인딩, 이메일 채널 테스트 실패 시 SMTP 상세 숨김.
- typecheck, lint, build, test(127개) 통과. **compose 포트 변경은 `docker compose config`로만 확인했고 컨테이너에는 적용하지 못했다**(Docker Desktop이 꺼져 있었음). 켠 뒤 `docker compose --profile app up -d --wait`로 재생성해 `docker compose ps`에서 `127.0.0.1:` 바인딩을 확인한다.
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 상태 페이지 `acme-status`.

## 다음 할 일
- 보안 남은 항목을 사용자와 정한다: **S-1 SSRF**(워커 연결 단계 IP 검사, 리다이렉트 홉별 재검증, SSL 점검 포함. 내부 서비스 감시용 허용 목록 환경변수를 둘지 결정 필요), **S-2**(이메일 채널을 관리자 전용으로 할지 허용 도메인 목록을 둘지, 테스트 발송 쿨다운), P-1(로그인 속도 제한이 Server Action 경로에도 걸리는지 실제 호출로 확인), P-2~P-5.
- `PLAN.md`의 "보류·나중에 정할 것"(배포 위치, webhook 암호화, 키워드 체크, 점검 시간)도 남아 있다.

## 미해결·결정 필요
- S-3은 새 입력만 막는다. DB에 이미 `user:pass@` URL이 든 모니터가 있는지 점검하지 않았다. S-4는 운영용 compose 분리와 DB 비밀번호 `.env` 이동이 남음. S-6은 팀당 모니터 수 상한이 남음.
- 워커: 한 틱이 최대 200개를 선점해 배치가 끝날 때까지 다음 선점을 못 한다. SIGTERM 종료 대기에 기한이 없어 `docker stop` 10초를 넘기면 SIGKILL.
- 공개 페이지: **down 상태로 비활성화한 모니터가 "일시정지"로 보여 장애가 가려진다**(정책 결정 필요). 워커가 죽으면 오래된 `up`이 계속 초록(`lastCheckedAt` 기준 "확인 중" 처리 필요). 없는 slug는 HTTP 200·noindex 없음.
- 사소: 가동률 `floor(pct*100)/100` 부동소수점 오차(`stats.ts`), `describeFetchError`에 `EHOSTUNREACH` 등 매핑 없음, "90일 전" 라벨이 실제 89일 전, `MonitorRow`의 `key={i}`, 푸터 `now`와 쿼리의 `today`가 따로, 일별 통계 쿼리가 raw SQL.
- 기존: 사용자별 시간대 고정 없음, 6시간 차트 버킷은 KST 자정 기준, "실패 테스트" 모니터는 Docker에서 down, 보관 기간 30일 미만이면 30일 차트에 빈 구간, 알림 재시도 없음, 채널 수정 화면·비밀번호 재설정 없음.

## 알아둘 것
- `"use cache"` 함수는 인자를 캐시 키로 쓴다. 요청마다 달라지는 값(`now` 등)을 인자로 넘기지 말고 안에서 만든다. `expire`가 5분 미만이면 빌드 때가 아니라 요청 시점에 실행된다.
- `ActionForm`은 제출 후 폼을 리셋하는데 `<select>`의 `defaultValue`는 다시 적용되지 않는다. 저장값이 바뀌는 select에는 `key={값}`을 준다.
- `Intl.supportedValuesOf("timeZone")`에는 `UTC`가 없다. `allTimeZones()`가 앞에 붙인다.
- Slack 앱 webhook은 `username`/`icon_emoji`를 무시한다. 로컬 `.env`의 `SMTP_FROM`이 코드 기본값보다 우선한다. 로컬 SMTP·Slack 채널은 실제 서비스라 테스트 중 알림이 실제로 나간다(채널 없는 모니터로 확인).
- dev와 Docker 스택을 동시에 띄우지 않는다. 같은 브랜치에서 여러 세션이 작업할 땐 `git add <파일>`로만 커밋한다. Windows `TaskStop`은 자식 프로세스를 남긴다.
- Git Bash heredoc과 PowerShell 5.1 인자는 한글·큰따옴표를 깨뜨린다. 파일은 Write로 만들고 커밋 메시지는 `git commit -F 파일`로 쓴다.
