# 구현 계획

UptimeRobot과 비슷한 웹사이트 가동 모니터링. 여러 사이트를 1분/5분 간격으로 체크하고 DB에 저장한다. 로그인한 팀원만 대시보드로 보고, 다운/복구와 SSL 만료는 Slack·이메일로 알린다.
규칙과 아키텍처는 `CLAUDE.md`, 현재 진행 상황은 `docs/HANDOFF.md`에 있다.

## 단계 (단계마다 실행 확인 → 커밋 → HANDOFF 갱신)
- [x] **1. 뼈대**: Next.js 16, Tailwind/shadcn, compose(postgres, mailpit), Drizzle, 핵심 테이블, `/api/health`, 워커 스텁
- [x] **2. 인증**: Better Auth(이메일+비밀번호), auth 테이블과 `user.role`(admin|member), `/setup`(사용자 0명일 때만 첫 관리자 생성), `/login`, 초대(`invitations` 테이블, `/invite/[token]`, 7일 유효, 초대 메일 발송), 공개 가입 비활성화, 경로 보호, `/settings/users`(관리자 전용: 초대·취소·권한 변경·삭제), `monitors.createdBy` FK
- [x] **3. 모니터 CRUD**: 추가/수정/삭제/일시정지. 필드는 이름, URL, 간격(1분/5분), 고급 설정(메서드 GET/HEAD, 타임아웃 1~30초, 기대 상태코드: `2xx`·`200,301`처럼 쉼표로 구분, `monitors.expected_status`), 알림 채널 선택
- [x] **4. 워커**: 체크 루프, `checks` 저장, 상태 판정(연속 2회 실패 시 down, 기대 상태코드는 `matchesExpectedStatus`로 판정), `incidents`(모니터당 열린 장애 1건). 판정 로직은 Vitest로 테스트. 개발용 `/api/test/fail`, `/api/test/slow`
- [x] **5. 대시보드**: 목록(상태 배지, 응답시간, 24h 가동률, 최근 체크 히트바, SSL 남은 일수), 상세 `/monitors/[id]`(응답시간 차트 24h/7d/30d, 가동률, 장애 이력, 최근 체크), 30초 폴링. 가동률 = 기간 내 성공 체크 비율
- [x] **6. 알림**: `/settings/alerts`에서 Slack webhook·이메일 채널 관리(추가·켜기/끄기·삭제, webhook 마스킹, Slack URL은 `https://hooks.slack.com/services/`만 허용), 테스트 발송, 다운/복구 알림(발송 실패는 로그만, 재시도 없음)
- [x] **7. SSL**: 하루 1회 만료일 조회(실패 시 약 1시간 뒤 재시도), 14/7/1일 전 알림(`ssl_alerts_sent` 테이블로 중복 방지, 만료된 인증서는 1일 임계값으로 한 번), URL 변경 시 저장된 만료일 초기화
- [x] **8. 공개 상태 페이지**: `status_pages`, `status_page_monitors` 테이블, `/settings/status-pages`(추가·수정·삭제, 팀원 누구나), `/status/[slug]`(전체 상태 배너, 모니터별 현재 상태와 90일 일별 가동률 막대, URL과 에러 상세 숨김). 90일 막대는 `monitor_daily_stats`(KST 일별 체크 수, 체크 저장과 같은 트랜잭션에서 증가)로 그려서 `checks` 보관 기간과 무관하다
- [x] **9. 정리**: 오래된 `checks` 삭제(관리자 설정 `/settings/general`의 보관 기간, 기본 30일, 7~365일. 워커가 1시간마다 삭제하고 `monitor_daily_stats`는 지우지 않음), `Dockerfile`(타깃 `web`=Next standalone, `worker`=esbuild 번들), compose `app` 프로필(`migrate` 1회 실행 → `web` + `worker`)
- [x] **10. 시간대**: 웹 화면은 보는 사람의 브라우저 시간대로 표시(`tz` 쿠키, 없으면 KST). 이메일 알림 시각은 관리자 설정 "알림 시간대"(`/settings/general`, `app_settings.alert_time_zone`, 기본 `Asia/Seoul`)로 쓰고 `14:03 KST`처럼 시간대 약칭을 붙인다. Slack은 `<!date^…>` 토큰이라 읽는 사람 시간대로 보이고 설정값은 대체 텍스트에만 쓴다. 일별 집계·차트 버킷 기준은 KST로 고정

## 화면 구성
- 상단 메뉴: 모니터 / 상태페이지 / 알림채널 / 사용자(관리자)
- 알림 메시지 예: `🔴 [DOWN] API 서버 — https://api.example.com · 원인: 503 · 14:03 감지` / `🟢 [UP] API 서버 복구 — 다운 시간 12분`

## 검증 방법
- Docker: `docker compose --profile app up -d --build --wait` 후 `/api/health`, 로그인, 워커 로그, Mailpit 수신을 확인한다.
- 정상 사이트(https://example.com)와 실패용 로컬 라우트(`/api/test/fail`, 개발 환경 전용)를 등록하고, 1~2분 뒤 상태와 `checks` 적재를 확인한다.
- 이메일은 Mailpit(http://localhost:8025), Slack은 테스트 webhook으로 확인한다.
- SSL은 https://expired.badssl.com 같은 테스트 사이트로 확인한다.
- 인증: 로그아웃 상태에서 보호 경로에 접근하면 `/login`으로 가는지, `/status/[slug]`는 로그인 없이 열리는지, 초대 없이 가입할 수 없는지 확인한다.

## 보류·나중에 정할 것
- 서버 배포 위치(현재는 로컬 PC 전용)
- Slack webhook DB 암호화(1차는 마스킹만)
- 키워드 체크, 점검 시간 설정
