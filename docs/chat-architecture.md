# 채팅방 구조 및 아키텍처

## 1. "처음 채팅방에 글자가 안먹히는 현상" 해결 과정

### 증상

첫 메시지를 보내면 입력창이 비활성화되고, 응답이 오지 않아 영원히 "로딩 중" 상태에 빠졌다.
이후에는 입력창이 `disabled` 상태로 고정되어 글자를 입력할 수 없었다.

### 근본 원인: 3개의 연쇄 버그

사용자가 메시지를 보내면 `isStreaming = true`가 되면서 입력창이 비활성화된다.
정상이면 응답 완료 시 `isStreaming = false`로 돌아가지만, **응답 자체가 오지 않아** 영원히 풀리지 않았다.

#### Bug 1. Claude CLI subprocess stdin hang (Python)

```
파일: claude-code-api/claude_code_api/core/claude_manager.py
```

**문제**: `asyncio.create_subprocess_exec()`로 Claude CLI를 실행할 때 `stdin=PIPE`를 설정했지만, stdin을 닫지 않았다. Claude CLI는 `-p` 플래그로 프롬프트를 받지만, stdin이 열려있으면 추가 입력을 기다리며 **영원히 블록**된다. stdout 출력이 0바이트.

**해결**:

```python
# claude_manager.py:106-110
# Close stdin immediately - prompt is passed via -p flag.
# Claude CLI blocks reading stdin when it's an open pipe.
if self.process.stdin:
    self.process.stdin.close()
    await self.process.stdin.wait_closed()
```

#### Bug 2. SSE 포맷 불일치 (Frontend)

```
파일: frontend/src/api/chat.ts
```

**문제**: Spring WebFlux가 SSE를 보낼 때 `data:{json}` (공백 없음) 형식을 사용하는데, 프론트엔드는 `data: ` (공백 있음)만 파싱했다. 그래서 모든 SSE 이벤트가 무시되었다.

**해결**:

```typescript
// chat.ts:22-27
function parseSSEData(line: string): string | null {
  if (line.startsWith('data: ')) return line.slice(6);  // 공백 있는 경우
  if (line.startsWith('data:')) return line.slice(5);    // 공백 없는 경우
  return null;
}
```

#### Bug 3. SSE 청크 파싱 누락 (Frontend)

```
파일: frontend/src/hooks/useChat.ts
```

**문제**: `onChunk`에서 받은 데이터가 OpenAI 호환 JSON(`{"choices":[{"delta":{"content":"..."}}]}`)인데, 이를 파싱하지 않고 raw JSON 문자열 그대로 화면에 출력했다.

**해결**:

```typescript
// useChat.ts:60-77
(chunk) => {
  try {
    const parsed = JSON.parse(chunk);
    if (parsed.metadata?.conversationId) {
      setCurrentConversation(parsed.metadata.conversationId);
      return;
    }
    const delta = parsed.choices?.[0]?.delta;
    if (delta?.content) {
      appendStreamingContent(delta.content);  // 텍스트만 추출
    }
  } catch {
    appendStreamingContent(chunk);  // JSON 아니면 그대로
  }
}
```

### 연쇄 관계

```
Bug 1 (stdin hang) → CLI 출력 없음 → 응답 안 옴 → isStreaming 영원히 true → 입력창 disabled
Bug 2 (SSE 포맷) → Bug 1 해결 후에도 응답 데이터 무시됨 → onDone 안 호출
Bug 3 (청크 파싱) → Bug 2 해결 후에도 JSON 원문이 화면에 출력됨
```

세 버그를 모두 해결해야 정상 동작했다.

---

## 2. 채팅 시스템 전체 아키텍처

### 데이터 흐름

```
┌──────────────┐     ┌─────────┐     ┌──────────────────┐     ┌────────────────────┐     ┌─────────────┐
│   React      │────▶│  Nginx  │────▶│  Spring Boot     │────▶│  Python FastAPI     │────▶│ Claude CLI  │
│   Frontend   │◀────│ (proxy) │◀────│  Backend         │◀────│  claude-code-api    │◀────│ subprocess  │
└──────────────┘ SSE └─────────┘     └──────────────────┘     └────────────────────┘     └─────────────┘
                                            │
                                     ┌──────┴──────┐
                                     │ PostgreSQL  │
                                     └─────────────┘
```

### 메시지 전송 흐름 (상세)

```
1. [사용자 입력]
   ChatInput.tsx → onSend(message) 호출

2. [상태 업데이트]
   useChat.ts → sendMessage()
   ├─ addMessage(userMessage)     // 즉시 화면에 표시
   ├─ setStreaming(true)          // 입력창 비활성화
   └─ resetStreamingContent()    // 스트리밍 버퍼 초기화

3. [API 호출]
   chat.ts → streamChat()
   └─ fetch POST /api/chat/completions
      body: { message, conversationId, model }

4. [Nginx 프록시]
   proxy_pass → Spring Boot
   proxy_buffering off (SSE용)

5. [Spring Backend]
   ChatController.java → Flux<String> (SSE 스트림)
   ChatProxyService.java:
   ├─ 대화방 생성/조회
   ├─ 사용자 메시지 DB 저장
   ├─ 컨텍스트 프롬프트 빌드 (요약 포함)
   ├─ metadata SSE 이벤트 전송 (conversationId)
   └─ WebClient.post() → Python API

6. [Python API]
   chat.py → POST /v1/chat/completions
   ├─ 인증 확인
   ├─ 세션/프로젝트 디렉토리 설정
   └─ claude_manager.create_session()

7. [Claude CLI]
   claude_manager.py → ClaudeProcess
   ├─ subprocess 실행 (--output-format stream-json)
   ├─ stdin 즉시 닫기 (Bug 1 해결)
   └─ stdout 비동기 읽기

8. [응답 스트리밍 (역방향)]
   Claude CLI stdout
   → streaming.py (OpenAI 호환 청크로 변환)
   → Python SSE: "data: {choices[0].delta.content}\n\n"
   → Spring WebClient (data: 프리픽스 제거, raw JSON)
   → Spring SSE 직렬화 (data: 프리픽스 재추가)
   → Nginx (버퍼링 없이 전달)
   → Frontend ReadableStream

9. [프론트엔드 수신]
   chat.ts:
   ├─ TextDecoder로 청크 디코딩
   ├─ parseSSEData()로 data 추출 (Bug 2 해결)
   └─ onChunk(rawJSON) 콜백 호출

   useChat.ts:
   ├─ JSON.parse → choices[0].delta.content 추출 (Bug 3 해결)
   └─ appendStreamingContent(text)

   chatStore.ts:
   └─ streamingContent += chunk (Zustand 상태)

10. [스트림 완료]
    "[DONE]" 수신 → onDone()
    ├─ streamingContent → assistantMessage로 변환
    ├─ addMessage(assistantMessage)
    ├─ resetStreamingContent()
    ├─ setStreaming(false)          // 입력창 재활성화
    └─ loadConversations()         // 사이드바 갱신

11. [백엔드 후처리 (doOnComplete)]
    ├─ assistant 메시지 DB 저장
    ├─ 대화 제목 자동 설정 (첫 메시지 50자)
    ├─ 컨텍스트 요약 트리거 (임계값 초과 시)
    └─ UsageLog 저장 (토큰 수, 응답 시간)
```

---

## 3. 파일 구조

### Frontend (`frontend/src/`)

| 파일 | 역할 |
|------|------|
| `components/chat/ChatWindow.tsx` | 채팅방 메인 컨테이너. 메시지 목록, 스트리밍 상태, 인증 배너 |
| `components/chat/ChatInput.tsx` | 입력창. Enter 전송, Shift+Enter 줄바꿈, 스트리밍 중 Stop 버튼 |
| `components/chat/MessageBubble.tsx` | 개별 메시지 버블. 사용자(파란색 우측), AI(회색 좌측) |
| `components/chat/StreamingMessage.tsx` | 스트리밍 중 실시간 렌더링. 깜빡이는 커서 |
| `components/chat/MarkdownRenderer.tsx` | 마크다운 렌더링. 코드 하이라이팅 (react-syntax-highlighter) |
| `components/layout/Sidebar.tsx` | 사이드바. 대화 목록, 토큰 수, 삭제 버튼 |
| `hooks/useChat.ts` | 채팅 커스텀 훅. 메시지 전송/수신/스트리밍 로직 |
| `store/chatStore.ts` | Zustand 상태 관리. conversations, messages, isStreaming 등 |
| `api/chat.ts` | SSE 스트림 클라이언트. `streamChat()`, `abortChat()` |
| `api/conversations.ts` | 대화 CRUD API 클라이언트 |
| `types/index.ts` | TypeScript 타입 정의 (Conversation, Message 등) |

### Backend (`backend/src/main/java/com/claudeplatform/`)

| 파일 | 역할 |
|------|------|
| `controller/ChatController.java` | `POST /api/chat/completions` → SSE Flux 스트림 |
| `service/ChatProxyService.java` | Python API 프록시. 메시지 저장, 응답 누적, 사용량 기록 |
| `service/ConversationService.java` | 대화/메시지 CRUD, 토큰 추정 (`text.length / 4`) |
| `service/ContextManagementService.java` | 컨텍스트 윈도우 관리, 요약 트리거 |
| `controller/ConversationController.java` | 대화 REST API (목록, 생성, 수정, 삭제) |
| `model/dto/ChatRequest.java` | 채팅 요청 DTO (message, conversationId, model) |
| `model/dto/ConversationDto.java` | 대화 응답 DTO (totalTokens, hasSummary 포함) |
| `repository/MessageRepository.java` | 메시지 JPA 레포지토리 (sumTokenCount 쿼리 포함) |

### Python API (`claude-code-api/claude_code_api/`)

| 파일 | 역할 |
|------|------|
| `api/chat.py` | `POST /v1/chat/completions` OpenAI 호환 엔드포인트 |
| `core/claude_manager.py` | Claude CLI subprocess 생명주기 관리 |
| `utils/streaming.py` | SSE 포맷터, OpenAI 스트림 변환기, 하트비트 |
| `utils/parser.py` | Claude CLI JSON 출력 파싱, OpenAI 형식 변환 |
| `core/config.py` | 설정 (debug, log level, claude binary path 등) |

---

## 4. 상태 관리 (Zustand)

```typescript
// chatStore.ts
{
  conversations: Conversation[]      // 사이드바 대화 목록
  currentConversationId: string|null // 현재 선택된 대화
  messages: Message[]                // 현재 대화의 메시지들
  isStreaming: boolean               // 스트리밍 중 여부 (입력창 disabled 제어)
  streamingContent: string           // 실시간 누적 텍스트
  selectedModel: string              // 선택된 모델 (기본: claude-haiku-4-5-20251001)
}
```

---

## 5. 주요 설정

| 항목 | 값 | 위치 |
|------|-----|------|
| Python API URL | `http://claude-code-api:8000` | `application.yml` |
| 스트림 타임아웃 | 5분 | `ChatProxyService.java` |
| SSE 하트비트 | 30초 | `streaming.py` |
| 토큰 추정 | `text.length / 4` | `ConversationService.java` |
| 컨텍스트 요약 | 임계값 초과 시 자동 | `ContextManagementService.java` |
| 대화 제목 자동 설정 | 첫 메시지 50자 | `ChatProxyService.java` |
