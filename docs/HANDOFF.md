# HANDOFF

_마지막 갱신: 2026-11-08 · 10단계(시간대) 끝난 뒤 코드 리뷰 3건(worker·monitor, status 페이지, 알림 발송)을 반영함_

## 현재 상태
- 동작함: 인증, 모니터 CRUD, 워커, 대시보드, 알림(down/recovered/ssl), SSL 만료 확인, 공개 상태 페이지, 체크 보관 기간·알림 시간대 설정, Docker 스택(`migrate` → `web` + `worker`).
- 시간대: 웹은 `tz` 쿠키(`getViewerTimeZone()`), 이메일은 `/settings/general`의 알림 시간대, Slack은 `<!date>` 토큰. 일별 집계·공개 페이지 90일 막대·차트 버킷 기준점은 KST 고정.
- 리뷰 반영(커밋 4aa46b9, fe195f5, 6dc7deb, 5186642):
  - `checkOne`은 throw하지 않는다(레인이 죽어 틱이 겹치던 문제). 일시정지 중 down이던 모니터가 재개 후 성공하면 `recovered` 알림을 보낸다. `recordResult(claimed, …)`는 체크 중 URL·메서드·타임아웃·기대 상태가 바뀌었으면 결과를 버리고, 알림에는 현재 이름·URL을 쓴다.
  - 공개 상태 페이지: 배너는 활성 모니터가 모두 up일 때만 초록(pending이면 회색 "확인 중", 전부 일시정지면 그렇게 표시). `getPublicStatusPage`는 `"use cache"`(revalidate 15초/expire 60초)라 관리자 수정이 최대 ~15초 늦게 반영된다. 제목 조회도 같은 캐시를 쓴다.
  - 알림: `notifyMonitorEvent`는 throw하지 않고, 이유 300자·Slack 섹션 3000자 제한, SMTP 타임아웃 10s/10s/30s.
- typecheck, lint, build, test(122개) 통과. Docker 스택을 새 이미지로 띄워 공개 페이지 배너 3가지·캐시 지연·재개 후 복구 로그를 확인했다. 실제 Slack/이메일 발송은 이번 변경분으로 확인하지 않았다.
- 로컬 DB 테스트 데이터: 관리자 `admin@example.com` / `password1234`, 상태 페이지 `acme-status`. 지금 Docker 스택이 실행 중이다.

## 다음 할 일
- 아래 "미해결" 중 먼저 고칠 것을 사용자와 정한다. `PLAN.md`의 "보류·나중에 정할 것"(배포 위치, webhook 암호화, 키워드 체크, 점검 시간)도 남아 있다.

## 미해결·결정 필요
- 워커 리뷰: 한 틱이 최대 200개를 선점해 배치가 끝날 때까지 다음 선점을 못 한다(느린 모니터가 많으면 1분 주기가 밀림). SIGTERM 종료 대기에 기한이 없어 `docker stop` 10초를 넘기면 SIGKILL. 모니터 URL이 사설망·루프백·`user:pass@`여도 통과(SSRF 정책 결정 필요).
- 공개 페이지: **down 상태로 비활성화한 모니터가 "일시정지"로 보여 장애가 가려진다**(마지막 상태 유지/숨김 정책 결정 필요). 워커가 죽으면 오래된 `up`이 계속 초록(`lastCheckedAt` 기준 "확인 중" 처리 필요). 없는 slug는 HTTP 200·noindex 없음.
- 사소: 가동률 `floor(pct*100)/100` 부동소수점 오차(`stats.ts`), `describeFetchError`에 `EHOSTUNREACH` 등 매핑 없음, "90일 전" 라벨이 실제 89일 전, `MonitorRow`의 `key={i}`, 푸터 `now`와 쿼리의 `today`가 따로, 일별 통계 쿼리가 raw SQL.
- 기존: 사용자별 시간대 고정 없음, 6시간 차트 버킷은 KST 자정 기준, "실패 테스트" 모니터는 Docker에서 down, 보관 기간 30일 미만이면 30일 차트에 빈 구간, 알림 재시도 없음, 채널 수정 화면·비밀번호 재설정 없음.

## 알아둘 것
- `"use cache"` 함수는 인자를 캐시 키로 쓴다. 요청마다 달라지는 값(`now` 등)을 인자로 넘기지 말고 안에서 만든다. `expire`가 5분 미만이면 빌드 때가 아니라 요청 시점에 실행된다.
- `ActionForm`은 제출 후 폼을 리셋하는데 `<select>`의 `defaultValue`는 다시 적용되지 않는다. 저장값이 바뀌는 select에는 `key={값}`을 준다.
- `Intl.supportedValuesOf("timeZone")`에는 `UTC`가 없다. `allTimeZones()`가 앞에 붙인다.
- Slack 앱 webhook은 `username`/`icon_emoji`를 무시한다. 로컬 `.env`의 `SMTP_FROM`이 코드 기본값보다 우선한다. 로컬 SMTP·Slack 채널은 실제 서비스라 테스트 중 알림이 실제로 나간다(채널 없는 모니터로 확인).
- dev와 Docker 스택을 동시에 띄우지 않는다. 같은 브랜치에서 여러 세션이 작업할 땐 `git add <파일>`로만 커밋한다. Windows `TaskStop`은 자식 프로세스를 남긴다.
- Git Bash heredoc과 PowerShell 5.1 인자는 한글·큰따옴표를 깨뜨린다. 파일은 Write로 만들고 커밋 메시지는 `git commit -F 파일`로 쓴다.
