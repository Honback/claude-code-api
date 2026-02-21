# Claude Code API Platform

Claude Code CLI를 REST API로 감싸서 웹 UI와 함께 제공하는 플랫폼.
React + Spring Boot + Nginx + PostgreSQL + claude-code-api를 Docker Compose로 구성.

## Architecture

```
Client (Browser)
    │
    ▼
Nginx (port 9090) ─── Reverse Proxy
    ├── React (port 3000) ─── Chat UI + Admin Dashboard
    ├── Spring Boot (port 8080) ─── API Gateway + Business Logic
    ├── claude-code-api (port 8000) ─── Claude Code CLI Wrapper (Python/FastAPI)
    └── PostgreSQL (port 5432) ─── Database
```

**네트워크 분리:**
- `frontend-net`: Nginx ↔ React ↔ Spring Boot
- `backend-net` (internal): Spring Boot ↔ claude-code-api ↔ PostgreSQL

**SSE 스트리밍 체인:**
```
React (fetch + ReadableStream)
  → Nginx (proxy_buffering off)
    → Spring Boot (WebClient → Flux<String>)
      → claude-code-api (FastAPI SSE)
        → Claude Code CLI
```

## Quick Start

### 1. 사전 준비

- Docker Desktop 설치 및 실행
- Anthropic API Key 준비

### 2. 설정

```bash
# .env 파일에 API 키 설정
vi .env
# ANTHROPIC_API_KEY=sk-ant-... 입력
```

### 3. 실행

```bash
# claude-code-api 클론 (최초 1회)
git clone https://github.com/codingworkflow/claude-code-api.git

# Docker Compose 빌드 & 실행
docker compose up --build -d
```

### 4. 접속

- **URL**: http://localhost:9090
- Sign up으로 회원가입 후 사용

### 5. 종료

```bash
docker compose down          # 컨테이너 중지
docker compose down -v       # 컨테이너 + DB 데이터 삭제
```

## 사용법

### 채팅

1. 로그인 후 `+ New Chat` 클릭
2. 하단 입력창에 메시지 작성 (Shift+Enter: 줄바꿈)
3. SSE 스트리밍으로 실시간 응답 수신
4. 상단 드롭다운에서 모델 변경 가능 (Sonnet 4 / Haiku 4.5 / Opus 4.6)
5. 좌측 사이드바에서 이전 대화 클릭하여 이어서 진행

### Admin 대시보드

1. Admin 계정으로 로그인
2. 상단 네비게이션의 `Admin` 클릭
3. 사용량 통계 확인 (총 요청, 토큰, 응답 시간)
4. API Key 생성 / 폐기 관리

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | - | 회원가입 |
| POST | `/api/auth/login` | - | 로그인 (JWT 반환) |
| GET | `/api/models` | - | 사용 가능 모델 목록 |
| POST | `/api/chat/completions` | JWT | SSE 스트리밍 채팅 |
| GET | `/api/conversations` | JWT | 대화 목록 |
| POST | `/api/conversations` | JWT | 대화 생성 |
| GET | `/api/conversations/{id}` | JWT | 대화 상세 (메시지 포함) |
| PUT | `/api/conversations/{id}` | JWT | 대화 제목 수정 |
| DELETE | `/api/conversations/{id}` | JWT | 대화 삭제 |
| GET | `/api/keys` | JWT | API 키 목록 |
| POST | `/api/keys` | JWT | API 키 생성 |
| DELETE | `/api/keys/{id}` | JWT | API 키 폐기 |
| GET | `/api/usage/summary` | JWT | 사용량 요약 |
| GET | `/api/admin/users` | Admin | 전체 사용자 목록 |
| PUT | `/api/admin/users/{id}` | Admin | 사용자 수정 (역할, 활성화) |
| GET | `/api/admin/usage/global` | Admin | 전체 사용량 통계 |
| GET | `/api/admin/sessions` | Admin | 활성 세션 목록 |

## Project Structure

```
260220_claude-code-api/
├── docker-compose.yml           # 5개 서비스 정의
├── .env                         # 환경 변수 (API 키, DB 설정)
├── .env.example
├── .gitignore
├── setup.sh                     # 자동 설정 스크립트
│
├── claude-code-api/             # git clone (Python/FastAPI)
│   └── docker/Dockerfile
│
├── nginx/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── conf.d/default.conf      # 리버스 프록시 + SSE 설정
│
├── backend/                     # Spring Boot 3.3 + Java 21
│   ├── Dockerfile / Dockerfile.dev
│   ├── pom.xml
│   └── src/main/java/com/claudeplatform/
│       ├── ClaudePlatformApplication.java
│       ├── config/              # Security, WebClient, CORS
│       ├── controller/          # Auth, Chat, Conversation, ApiKey, Usage, Admin, Model
│       ├── service/             # AuthService, ChatProxyService, ConversationService,
│       │                          UsageTrackingService, ApiKeyService
│       ├── repository/          # JPA Repository 인터페이스 (6개)
│       ├── model/
│       │   ├── entity/          # User, Conversation, Message, ApiKey, UsageLog, ActiveSession
│       │   └── dto/             # AuthRequest/Response, ChatRequest, ConversationDto, etc.
│       ├── security/            # JwtTokenProvider, JwtAuthenticationFilter
│       └── exception/           # GlobalExceptionHandler
│
├── frontend/                    # React 18 + TypeScript + Vite
│   ├── Dockerfile / Dockerfile.dev
│   ├── package.json
│   └── src/
│       ├── App.tsx              # 라우팅 + ProtectedRoute
│       ├── api/                 # client, auth, chat (SSE), conversations, admin
│       ├── components/
│       │   ├── chat/            # ChatWindow, MessageBubble, StreamingMessage, ChatInput
│       │   ├── admin/           # Dashboard, ApiKeyManager, UsageChart
│       │   ├── auth/            # LoginForm, SignupForm
│       │   └── layout/          # AppLayout, Navbar, Sidebar
│       ├── hooks/               # useAuth, useChat
│       ├── store/               # Zustand: authStore, chatStore
│       └── types/               # TypeScript 인터페이스
│
└── database/
    └── init/01-init.sql         # 6개 테이블 + 기본 Admin 계정
```

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Reverse Proxy | Nginx | 1.27 |
| Frontend | React + TypeScript + Vite | 18 |
| UI Styling | Tailwind CSS | 3.4 |
| State Management | Zustand | 5.0 |
| Markdown Rendering | react-markdown + react-syntax-highlighter | - |
| Charts | Recharts | 2.13 |
| Backend | Spring Boot + Java | 3.3 / 21 |
| Security | Spring Security + JWT (jjwt) | - |
| HTTP Client | Spring WebFlux WebClient | - |
| ORM | Spring Data JPA + Hibernate | - |
| Database | PostgreSQL | 16 |
| Claude API Wrapper | codingworkflow/claude-code-api (FastAPI) | - |
| Container | Docker Compose | v3.9 |

## Database Schema

```
users              conversations       messages
├── id (UUID PK)   ├── id (UUID PK)    ├── id (UUID PK)
├── email          ├── user_id (FK)    ├── conversation_id (FK)
├── password_hash  ├── title           ├── role
├── name           ├── model           ├── content
├── role           ├── created_at      ├── token_count
├── is_active      └── updated_at      └── created_at
├── created_at
└── updated_at

api_keys            usage_logs          active_sessions
├── id (UUID PK)    ├── id (UUID PK)    ├── id (UUID PK)
├── user_id (FK)    ├── user_id (FK)    ├── user_id (FK)
├── name            ├── conversation_id ├── session_id
├── key_hash        ├── model           ├── model
├── key_prefix      ├── input_tokens    ├── started_at
├── permissions     ├── output_tokens   └── last_activity_at
├── is_active       ├── total_tokens
├── last_used_at    ├── response_time_ms
└── created_at      ├── status
                    └── created_at
```

## Useful Commands

```bash
# 로그 확인
docker compose logs -f              # 전체 로그
docker compose logs backend -f      # Spring Boot 로그
docker compose logs claude-code-api -f  # Claude API 로그

# 서비스 재시작
docker compose restart backend      # 백엔드만 재시작
docker compose up -d --build backend  # 백엔드 재빌드

# DB 접속
docker compose exec postgres psql -U claude_admin -d claude_platform

# 컨테이너 상태
docker compose ps
```
