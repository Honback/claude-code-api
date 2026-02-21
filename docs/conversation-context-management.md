# 대화 컨텍스트 관리 시스템

> 대화가 길어져도 Claude가 이전 맥락을 기억하도록 자동 요약 + 컨텍스트 주입을 수행하는 시스템

## 개요

Claude CLI는 대화 히스토리를 자체적으로 유지하지 않는다. `claude-code-api`의 `_extract_prompts()`는 messages 배열 중 **마지막 user 메시지만** 사용하기 때문에, 백엔드에서 이전 대화 내용을 하나의 "context-enriched prompt"로 조립하여 단일 user 메시지로 전달한다.

### 핵심 수치

| 항목 | 값 | 설명 |
|------|-----|------|
| 토큰 추정 방식 | `텍스트 길이 / 4` | 1토큰 ≈ 4글자 |
| 요약 트리거 기준 | 8,000 토큰 | ≈ 32,000자 (한글 약 16,000자) |
| 컨텍스트 최근 메시지 수 | 6개 | 요약 이후 최근 메시지 |
| 컨텍스트 내 메시지 최대 길이 | 2,000자 | 초과 시 truncate |
| 요약 프롬프트 내 메시지 최대 길이 | 3,000자 | 초과 시 truncate |
| 요약 모델 | Claude Haiku | 비용 최소화 |
| 요약 max_tokens | 1,024 | 약 500단어 이내 |
| 요약 timeout | 60초 | 초과 시 FAILED 처리 |

---

## 전체 동작 흐름

```
사용자가 메시지를 보냄
        │
        ▼
┌─────────────────────────────────┐
│ 1. 메시지 DB 저장               │  ConversationService.saveMessage()
│    (tokenCount = 글자수/4 저장)  │  → messages 테이블에 저장
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│ 2. 컨텍스트 프롬프트 빌드       │  ContextManagementService.buildContextPrompt()
│    이전 대화 + 현재 메시지 조립  │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│ 3. Claude에게 전달 → 응답 수신  │  ChatProxyService → claude-code-api
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│ 4. 응답 완료 후 요약 필요 판단  │  shouldSummarize()
│    미요약 토큰 > 8,000?         │
│                                 │
│    YES → 비동기 요약 생성       │  triggerSummarizationAsync()
│    NO  → 끝                     │
└─────────────────────────────────┘
```

---

## 단계별 상세 설명

### 1단계: 컨텍스트 프롬프트 빌드

**파일**: `backend/.../service/ContextManagementService.java` → `buildContextPrompt()`

대화 길이에 따라 Claude에게 보내는 프롬프트 구조가 달라진다.

#### Case A: 짧은 대화 (이전 메시지 0~1개)

```
그냥 현재 메시지만 전달 (원본 그대로)
```

#### Case B: 중간 대화 (요약 없음, 이전 메시지 2개 이상)

```
[RECENT MESSAGES]
USER: 첫 번째 질문...
ASSISTANT: 첫 번째 답변...
USER: 두 번째 질문...
ASSISTANT: 두 번째 답변...
(최대 6개까지만 포함)

[CURRENT MESSAGE]
세 번째 질문...
```

#### Case C: 긴 대화 (요약 존재)

```
[CONVERSATION CONTEXT]
The following is a summary of our earlier conversation:
사용자는 우주정거장 시뮬레이터 프로젝트를 논의했다.
주요 기능은 산소 재활용이며 WebGL 플랫폼 타겟...

[RECENT MESSAGES]
USER: 최근 질문...
ASSISTANT: 최근 답변...
(요약 이후 메시지 중 최대 6개)

[CURRENT MESSAGE]
현재 질문...
```

> 위 전체가 **하나의 user 메시지**로 합쳐져서 `claude-code-api`에 전달된다.

---

### 2단계: 요약 필요 판단

**파일**: `backend/.../service/ContextManagementService.java` → `shouldSummarize()`

응답이 완료될 때마다 실행된다.

```
shouldSummarize(conversationId) {
    1. 이미 IN_PROGRESS 요약이 있나? → YES: false (중복 방지)

    2. 이전 COMPLETED 요약이 있나?
       YES → 요약 이후 메시지의 토큰 합계 계산
       NO  → 전체 메시지의 토큰 합계 계산

    3. 미요약 토큰 > 8,000? → true (요약 필요!)
}
```

예시 계산:

```
메시지 1: "안녕하세요" (5자)           → 1 토큰
메시지 2: "반갑습니다..." (100자)      → 25 토큰
...
메시지 30: "긴 코드 설명..." (4000자)  → 1000 토큰
────────────────────────────────────────
누적 토큰 합계: 8,500 > 8,000 → 요약 트리거!
```

---

### 3단계: 비동기 요약 생성

**파일**: `backend/.../service/ContextManagementService.java` → `triggerSummarizationAsync()`

`@Async`로 백그라운드에서 실행된다 (사용자 응답에 영향 없음).

```
triggerSummarizationAsync(conversationId) {
    1. conversation_summaries 테이블에 IN_PROGRESS 레코드 생성
       → 다른 요약 요청이 동시에 들어와도 중복 방지

    2. 요약 프롬프트 빌드:
       ┌──────────────────────────────────────┐
       │ "Summarize the following conversation │
       │  concisely..."                        │
       │                                       │
       │ 이전 요약 있으면:                      │
       │   "Previous summary: (기존 요약)"     │
       │   "New messages since last summary:"  │
       │   (요약 이후 새 메시지들만)             │
       │                                       │
       │ 이전 요약 없으면:                      │
       │   "Conversation:"                     │
       │   (전체 메시지)                        │
       │                                       │
       │ * 개별 메시지 3,000자 초과 시 truncate │
       └──────────────────────────────────────┘

    3. POST /v1/summarize → Anthropic API 직접 호출
       모델: Claude Haiku (비용 최소화)
       max_tokens: 1024
       timeout: 60초

    4. 성공 → status = COMPLETED, 요약 텍스트 저장
       실패 → status = FAILED (다음 메시지에서 재시도)
}
```

**요약 API 엔드포인트**: `claude-code-api/claude_code_api/api/summarize.py`

Anthropic Messages API를 직접 호출하여 요약을 생성한다. API 키는 기존 `rate_limits.py`의 `_get_anthropic_api_key()`를 공유한다.

---

### 4단계: 요약의 점진적 업데이트

대화가 계속되면 요약은 **버전별로 누적**된다.

```
v1 요약 (메시지 1~30 커버):
  "사용자가 프로젝트 구조를 설계하고 인증 시스템을 논의했다..."

    ↓ 메시지 31~60이 추가되고 다시 8,000 토큰 초과

v2 요약 (메시지 1~60 커버):
  "Previous summary: (v1 내용)"
  + "New messages: (31~60)"
  → 새로운 통합 요약 생성

    ↓ 계속 반복...
```

---

## DB 구조

### conversation_summaries 테이블

```sql
CREATE TABLE conversation_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    covered_until_message_id UUID NOT NULL REFERENCES messages(id),
    covered_message_count INT NOT NULL DEFAULT 0,
    covered_token_count INT NOT NULL DEFAULT 0,
    summary_version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_conv_summaries_conv_id ON conversation_summaries(conversation_id);
```

| 컬럼 | 설명 |
|------|------|
| `id` | 요약 레코드 고유 ID |
| `conversation_id` | 어떤 대화의 요약인지 |
| `summary_text` | 요약 내용 |
| `covered_until_message_id` | 어디까지 요약했는지 (마지막 메시지 ID) |
| `covered_message_count` | 요약에 포함된 메시지 수 |
| `covered_token_count` | 요약에 포함된 토큰 수 |
| `summary_version` | 요약 버전 (1, 2, 3...) |
| `status` | `IN_PROGRESS` / `COMPLETED` / `FAILED` |
| `created_at` | 생성 시각 |

---

## 에지 케이스 처리

| 상황 | 처리 방식 |
|------|-----------|
| 첫 1~2 메시지 | 현재 메시지만 전달 (요약/컨텍스트 없음) |
| 요약 중 새 메시지 도착 | IN_PROGRESS 체크로 중복 요약 방지 |
| 요약 실패 | FAILED 기록, 다음 응답 완료 시 재시도 |
| 2,000자 초과 메시지 | 컨텍스트에서 2,000자로 truncate |
| 3,000자 초과 메시지 | 요약 프롬프트에서 3,000자로 truncate |
| API 키 미설정 | 요약 건너뜀 (빈 문자열 반환) |
| 컨텍스트 기능 비활성화 | 현재 메시지만 전달 (원본 그대로) |

---

## 설정값

`backend/src/main/resources/application.yml`에서 조정 가능:

```yaml
app:
  context:
    enabled: ${APP_CONTEXT_ENABLED:true}                          # 컨텍스트 시스템 on/off
    summarization-threshold-tokens: ${APP_CONTEXT_THRESHOLD:8000} # 요약 트리거 기준
    recent-messages-to-keep: ${APP_CONTEXT_RECENT_MESSAGES:6}     # 컨텍스트 최근 메시지 수
```

Docker Compose 환경변수로도 오버라이드 가능:

```yaml
environment:
  APP_CONTEXT_ENABLED: "true"
  APP_CONTEXT_THRESHOLD: "16000"
  APP_CONTEXT_RECENT_MESSAGES: "8"
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `backend/.../service/ContextManagementService.java` | 핵심: 컨텍스트 빌드, 요약 판단, 요약 생성 |
| `backend/.../service/ChatProxyService.java` | 컨텍스트 빌드 호출 + 비동기 요약 트리거 |
| `backend/.../entity/ConversationSummary.java` | JPA 엔티티 |
| `backend/.../repository/ConversationSummaryRepository.java` | 요약 조회/상태 체크 |
| `backend/.../repository/MessageRepository.java` | 토큰 합계/시간순 쿼리 |
| `claude-code-api/.../api/summarize.py` | Anthropic API 직접 호출 요약 엔드포인트 |
| `database/init/03-conversation-summaries.sql` | 테이블 DDL |
| `backend/.../resources/application.yml` | 설정값 |

---

## conversationId 전파 (메타데이터 SSE 이벤트)

대화 컨텍스트가 올바르게 동작하려면 같은 대화방의 메시지가 모두 동일한 `conversationId`로 저장되어야 한다. 이를 위해 백엔드가 첫 메시지로 대화를 생성한 뒤, SSE 스트림 시작 시 메타데이터 이벤트를 보낸다.

### 백엔드 (ChatProxyService.java)

```java
// Raw JSON만 전달 - Spring SSE 직렬화가 data: 래핑을 자동 처리
Flux<String> metadataFlux = Flux.just(
    "{\"metadata\":{\"conversationId\":\"" + finalConversationId + "\"}}");
return Flux.concat(metadataFlux, chatFlux);
```

### 프론트엔드 (useChat.ts)

```typescript
(chunk) => {
  const parsed = JSON.parse(chunk);
  // 메타데이터 이벤트 감지 → conversationId 저장
  if (parsed.metadata?.conversationId) {
    setCurrentConversation(parsed.metadata.conversationId);
    return;
  }
  // 일반 SSE 청크 처리
  const delta = parsed.choices?.[0]?.delta;
  if (delta?.content) {
    appendStreamingContent(delta.content);
  }
}
```

이를 통해 첫 메시지 이후 모든 메시지가 같은 대화에 저장되어 컨텍스트 시스템이 정상 동작한다.
