# Claude Code API Platform - PDCA Analysis Report

- **Date**: 2026-02-20
- **Phase**: Check (Gap Analysis)
- **Overall Match Rate**: 83%

---

## 1. Category Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Infrastructure (Docker/Nginx) | 88% | WARN |
| Database Schema | 100% | PASS |
| Backend (Spring Boot) | 85% | WARN |
| Frontend (React) | 82% | WARN |
| Dockerfiles | 95% | PASS |
| **Overall** | **83%** | **WARN** |

> Auth 관련 항목은 사용자 요청에 의한 의도적 제거이므로 갭에서 제외.

---

## 2. PASS Items (설계대로 구현됨)

### Infrastructure
- 5개 서비스 모두 존재 (nginx, frontend, backend, claude-code-api, postgres)
- 네트워크 분리: `frontend-net` (public), `backend-net` (internal)
- Health check: postgres (pg_isready), backend (actuator/health)
- Nginx SSE 설정 완벽: `proxy_buffering off`, `gzip off`, `X-Accel-Buffering no`, `proxy_read_timeout 600s`

### Database
- 6개 테이블 모두 존재 (users, conversations, messages, api_keys, usage_logs, active_sessions)
- 적절한 인덱스, FK 제약조건, CASCADE 삭제

### Backend
- 7개 Controller, 5개 Service, 6개 Repository, 6개 Entity, 7개 DTO
- ChatProxyService SSE 스트리밍 체인 동작
- WebClient로 claude-code-api 연동 (OpenAI 호환 포맷)

### Frontend
- 12개 Component, 5개 API 모듈, 2개 Store, 2개 Hook
- react-markdown + syntax-highlighter 코드 렌더링
- Recharts 사용량 차트
- Zustand 상태관리

---

## 3. Technical Issues (수정 필요)

### CRITICAL - 즉시 수정

| # | 파일 | 문제 | 영향도 |
|---|------|------|--------|
| C1 | `ChatProxyService.java:58` | `StringBuilder`가 리액티브 스레드에서 동시접근 - 스레드 안전하지 않음 | HIGH |
| C2 | `ChatProxyService.java:70-110` | `doOnComplete/doOnError`에서 블로킹 JPA 호출 - Netty 이벤트 루프 스레드 고갈 가능 | HIGH |
| C3 | `chat.ts:31-47` | SSE 청크 경계에서 라인 분할 버그 - 메시지 유실 가능 | HIGH |
| C4 | `chat.ts` | AbortController 없음 - 페이지 이동 시 메모리 누수 | MEDIUM |

### WARNING - 개선 권장

| # | 파일 | 문제 | 영향도 |
|---|------|------|--------|
| W1 | `GlobalExceptionHandler.java` | `String.contains()`로 예외 분류 - 취약한 패턴 | MEDIUM |
| W2 | `ChatRequest.java` | 입력 검증 없음 (`message`가 null/empty 가능) | MEDIUM |
| W3 | `UsageController.java:18` | `days` 파라미터 상한 없음 - 풀 테이블 스캔 가능 | LOW |
| W4 | `ConversationService.java` | 페이지네이션 없음 - 대화 증가 시 성능 저하 | LOW |
| W5 | `MessageBubble.tsx` + `StreamingMessage.tsx` | Markdown 렌더링 코드 중복 | LOW |
| W6 | `CorsConfig.java:17` | CORS origins 하드코딩 | LOW |

### INFO - 참고사항

| # | 항목 | 비고 |
|---|------|------|
| I1 | 테스트 코드 없음 | Backend/Frontend 모두 0개 |
| I2 | Rate limiting 없음 | 모든 엔드포인트에 제한 없음 |
| I3 | HTTPS 미설정 | Nginx 80 포트만 리슨 |
| I4 | SessionMonitor 컴포넌트 미구현 | 계획에 있으나 미구현 |
| I5 | docker-compose.dev.yml 미생성 | 계획에 있으나 미생성 |
| I6 | TanStack Query 미사용 | 계획에 있으나 raw fetch 사용 |

---

## 4. Intentional Changes (의도적 변경)

사용자 요청으로 인증이 완전 제거됨:
- SecurityConfig: `anyRequest().permitAll()`
- JwtAuthenticationFilter: 존재하나 미연결 (의도적)
- 모든 Controller: `DefaultUserConfig.DEFAULT_USER_ID` 사용
- Frontend: login/signup 라우트 제거, JWT 토큰 전송 제거
- 직접 채팅 화면 진입

---

## 5. Fix Priority

### Phase 1 (즉시 - C1~C4)
1. ChatProxyService 리액티브/블로킹 분리
2. SSE 파싱 버그 수정 + AbortController 추가

### Phase 2 (단기 - W1~W3)
3. 커스텀 예외 클래스 도입
4. 입력 검증 추가
5. days 파라미터 제한

### Phase 3 (중기 - W4~W6)
6. 페이지네이션 추가
7. Markdown 렌더링 컴포넌트 통합
8. CORS 설정 환경변수화
