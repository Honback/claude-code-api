"""Claude API direct call management (no CLI dependency)."""

import asyncio
import json
import os
import time
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional

import httpx
import structlog

from claude_code_api.models.claude import get_available_models, get_default_model

from .config import settings
from .security import ensure_directory_within_base

logger = structlog.get_logger()

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_API_VERSION = "2023-06-01"

# OAuth constants for token refresh
OAUTH_TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

# Last auth error message (accessible by callers)
_auth_error: Optional[str] = None


def _get_cred_path() -> str:
    return os.path.join(
        os.environ.get(
            "CLAUDE_CONFIG_DIR",
            os.path.join(os.path.expanduser("~"), ".claude"),
        ),
        ".credentials.json",
    )


async def _refresh_oauth_token(refresh_token: str, cred_path: str) -> Optional[Dict[str, str]]:
    """Refresh OAuth access token using the stored refresh token."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                OAUTH_TOKEN_URL,
                json={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": OAUTH_CLIENT_ID,
                },
                headers={"Content-Type": "application/json"},
            )

            if resp.status_code != 200:
                logger.warning(
                    "Token refresh failed",
                    status=resp.status_code,
                    body=resp.text[:200],
                )
                return None

            tokens = resp.json()
            new_access = tokens.get("access_token")
            if not new_access:
                return None

            # Save updated tokens
            existing = {}
            if os.path.exists(cred_path):
                with open(cred_path) as f:
                    existing = json.load(f)

            expires_in = tokens.get("expires_in", 3600)
            expires_at = int(time.time() + expires_in) * 1000

            existing["claudeAiOauth"] = {
                "accessToken": new_access,
                "refreshToken": tokens.get("refresh_token", refresh_token),
                "expiresAt": expires_at,
                "scopes": existing.get("claudeAiOauth", {}).get("scopes", []),
            }

            with open(cred_path, "w") as f:
                json.dump(existing, f)
            os.chmod(cred_path, 0o600)

            logger.info("OAuth token refreshed successfully", expires_in=expires_in)
            return {"Authorization": f"Bearer {new_access}"}
    except Exception as e:
        logger.error("Token refresh error", error=str(e))
        return None


async def _get_auth_headers() -> Optional[Dict[str, str]]:
    """Get auth headers from OAuth token, API key, or env var.

    Auto-refreshes expired OAuth tokens using the refresh token.
    Returns dict with appropriate auth headers, or None if no auth found.
    """
    global _auth_error
    _auth_error = None

    # 1. OAuth token (from Settings page OAuth login)
    cred_path = _get_cred_path()
    if os.path.exists(cred_path):
        try:
            with open(cred_path) as f:
                creds = json.load(f)
            oauth = creds.get("claudeAiOauth", {})
            token = oauth.get("accessToken")
            refresh_token = oauth.get("refreshToken")
            expires_at = oauth.get("expiresAt", 0)

            if token:
                now_ms = int(time.time() * 1000)

                # Token still valid (with 5-min buffer)
                if expires_at > now_ms + 300_000:
                    return {"Authorization": f"Bearer {token}"}

                # Token expired or about to expire — try refresh
                if refresh_token:
                    logger.info("Access token expired, attempting auto-refresh")
                    refreshed = await _refresh_oauth_token(refresh_token, cred_path)
                    if refreshed:
                        return refreshed

                # Refresh failed or no refresh token
                if expires_at > 0:
                    expired_time = datetime.fromtimestamp(expires_at / 1000)
                    expired_str = expired_time.strftime("%Y-%m-%d %H:%M:%S")
                    _auth_error = (
                        f"OAuth 토큰이 {expired_str}에 만료되었습니다. "
                        "Settings 페이지에서 다시 로그인하세요."
                    )
                else:
                    _auth_error = (
                        "OAuth 토큰이 만료되었습니다. "
                        "Settings 페이지에서 다시 로그인하세요."
                    )
                logger.warning("OAuth token expired", error=_auth_error)
                return None
        except Exception:
            pass

    # 2. API key from config file (Settings page)
    config_path = os.path.join(
        os.path.expanduser("~"), ".config", "claude", "config.json"
    )
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                config = json.load(f)
            key = config.get("apiKey", "")
            if key and key.startswith("sk-"):
                return {"x-api-key": key}
        except Exception:
            pass

    # 3. Environment variable
    env_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if env_key and env_key.startswith("sk-"):
        return {"x-api-key": env_key}

    # 4. Settings
    if settings.claude_api_key and settings.claude_api_key.startswith("sk-"):
        return {"x-api-key": settings.claude_api_key}

    return None


class ClaudeProcess:
    """Manages a single Anthropic API call (replaces CLI subprocess)."""

    def __init__(
        self,
        session_id: str,
        project_path: str,
        on_cli_session_id: Optional[Callable[[str], None]] = None,
        on_end: Optional[Callable[["ClaudeProcess"], None]] = None,
    ):
        self.session_id = session_id
        self.cli_session_id: Optional[str] = None
        self.project_path = project_path
        self.process = None  # kept for interface compatibility
        self.is_running = False
        self.output_queue: asyncio.Queue[Optional[Dict[str, Any]]] = asyncio.Queue()
        self._on_cli_session_id = on_cli_session_id
        self._on_end = on_end
        self.last_error: Optional[str] = None
        self._task: Optional[asyncio.Task] = None

    async def start(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> bool:
        """Start Anthropic API streaming call."""
        self.last_error = None
        auth_headers = await _get_auth_headers()
        if not auth_headers:
            self.last_error = _auth_error or (
                "인증이 설정되지 않았습니다. "
                "Settings 페이지에서 OAuth 로그인하거나 API 키를 설정하세요."
            )
            logger.error("No auth configured", session_id=self.session_id)
            return False

        resolved_model = model or get_default_model()
        logger.info(
            "Starting Anthropic API call",
            session_id=self.session_id,
            model=resolved_model,
        )

        # Generate a session ID for compatibility
        self.cli_session_id = str(uuid.uuid4())
        if self._on_cli_session_id:
            self._on_cli_session_id(self.cli_session_id)

        self.is_running = True
        self._task = asyncio.create_task(
            self._stream_api_call(auth_headers, prompt, resolved_model, system_prompt)
        )
        return True

    async def _stream_api_call(
        self,
        auth_headers: Dict[str, str],
        prompt: str,
        model: str,
        system_prompt: Optional[str],
    ) -> None:
        """Make streaming API call to Anthropic and queue output."""
        try:
            body: Dict[str, Any] = {
                "model": model,
                "max_tokens": 8192,
                "stream": True,
                "messages": [{"role": "user", "content": prompt}],
            }
            if system_prompt:
                body["system"] = system_prompt

            headers = {
                **auth_headers,
                "anthropic-version": ANTHROPIC_API_VERSION,
                "content-type": "application/json",
                "accept": "text/event-stream",
            }

            # Collect text and usage as we stream
            full_text = ""
            input_tokens = 0
            output_tokens = 0

            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
                async with client.stream(
                    "POST", ANTHROPIC_API_URL, json=body, headers=headers
                ) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        error_text = error_body.decode()
                        self.last_error = f"Anthropic API error {response.status_code}: {error_text[:200]}"
                        logger.error(
                            "API call failed",
                            status=response.status_code,
                            error=error_text[:200],
                        )
                        return

                    event_type = ""
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("event: "):
                            event_type = line[7:].strip()
                            continue
                        if not line.startswith("data: "):
                            continue

                        data_str = line[6:].strip()
                        if not data_str:
                            continue

                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        if event_type == "message_start":
                            msg = data.get("message", {})
                            usage = msg.get("usage", {})
                            input_tokens = usage.get("input_tokens", 0)

                        elif event_type == "content_block_delta":
                            delta = data.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    full_text += text
                                    # Yield as assistant message for streaming
                                    await self.output_queue.put(
                                        {
                                            "type": "assistant",
                                            "message": {
                                                "role": "assistant",
                                                "content": [
                                                    {"type": "text", "text": text}
                                                ],
                                            },
                                            "session_id": self.cli_session_id,
                                        }
                                    )

                        elif event_type == "message_delta":
                            usage = data.get("usage", {})
                            output_tokens = usage.get("output_tokens", 0)

                        elif event_type == "message_stop":
                            pass

                        elif event_type == "error":
                            error_msg = data.get("error", {}).get(
                                "message", "Unknown error"
                            )
                            self.last_error = error_msg
                            logger.error("Stream error", error=error_msg)

            # Yield final result message
            total_tokens = input_tokens + output_tokens
            await self.output_queue.put(
                {
                    "type": "result",
                    "subtype": "success",
                    "result": full_text,
                    "session_id": self.cli_session_id,
                    "usage": {
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                    },
                    "cost_usd": 0.0,
                }
            )

        except httpx.TimeoutException:
            self.last_error = "API call timed out"
            logger.error("API timeout", session_id=self.session_id)
        except Exception as e:
            self.last_error = str(e)
            logger.error(
                "API call failed", session_id=self.session_id, error=str(e)
            )
        finally:
            await self.output_queue.put(None)  # End signal
            self.is_running = False
            if self._on_end:
                self._on_end(self)

    async def get_output(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Get output from API call."""
        while True:
            try:
                output = await asyncio.wait_for(
                    self.output_queue.get(),
                    timeout=settings.streaming_timeout_seconds,
                )
                if output is None:
                    break
                yield output
            except asyncio.TimeoutError:
                logger.warning("Output timeout", session_id=self.session_id)
                break
            except Exception as e:
                logger.error(
                    "Error getting output",
                    session_id=self.session_id,
                    error=str(e),
                )
                break

    async def send_input(self, text: str):
        """No-op for API mode. Use a new request for follow-up."""
        logger.warning(
            "send_input not supported in API mode",
            session_id=self.session_id,
        )

    async def stop(self):
        """Stop the API call."""
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info("Claude process stopped", session_id=self.session_id)


class ClaudeManagerError(RuntimeError):
    """Base error for Claude manager operations."""


class ClaudeBinaryNotFoundError(ClaudeManagerError):
    """Raised when the Claude binary cannot be located."""


class ClaudeVersionError(ClaudeManagerError):
    """Raised when the Claude version cannot be determined."""


class ClaudeConcurrencyError(ClaudeManagerError):
    """Raised when the concurrent session limit is exceeded."""


class ClaudeProcessStartError(ClaudeManagerError):
    """Raised when a Claude process fails to start."""


class ClaudeSessionConflictError(ClaudeManagerError):
    """Raised when a session already has an active Claude process."""


class ClaudeModelNotSupportedError(ClaudeManagerError):
    """Raised when Claude rejects a requested model."""


class ClaudeManager:
    """Manages multiple Claude API sessions."""

    def __init__(self):
        self.processes: Dict[str, ClaudeProcess] = {}
        self.cli_session_index: Dict[str, str] = {}
        self.max_concurrent = settings.max_concurrent_sessions
        self._session_lock = asyncio.Lock()

    async def get_version(self) -> str:
        """Return API mode version string."""
        auth = await _get_auth_headers()
        if auth:
            mode = "OAuth" if "Authorization" in auth else "API-key"
            return f"API-direct ({mode})"
        return "API-direct (no auth configured)"

    async def create_session(
        self,
        session_id: str,
        project_path: str,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        on_cli_session_id: Optional[Callable[[str], None]] = None,
    ) -> ClaudeProcess:
        """Create new Claude session via API."""
        async with self._session_lock:
            # Check capacity
            existing = self.processes.get(session_id)
            if existing and existing.is_running:
                raise ClaudeSessionConflictError(
                    f"Session {session_id} already has an active process"
                )
            if existing and not existing.is_running:
                self._cleanup_process(existing)
            if len(self.processes) >= self.max_concurrent:
                raise ClaudeConcurrencyError(
                    f"Maximum concurrent sessions ({self.max_concurrent}) reached"
                )

            def _handle_cli_session_id(cli_session_id: str):
                self._register_cli_session(session_id, cli_session_id)
                if on_cli_session_id:
                    on_cli_session_id(cli_session_id)

            process = ClaudeProcess(
                session_id=session_id,
                project_path=project_path,
                on_cli_session_id=_handle_cli_session_id,
                on_end=self._cleanup_process,
            )

            success = await process.start(
                prompt=prompt, model=model, system_prompt=system_prompt
            )
            if not success:
                raise ClaudeProcessStartError(
                    process.last_error or "Failed to start API call"
                )

            self.processes[session_id] = process
            logger.info(
                "Claude session created",
                session_id=session_id,
                active_sessions=len(self.processes),
            )
            return process

    def get_session(self, session_id: str) -> Optional[ClaudeProcess]:
        """Get existing Claude session."""
        resolved = self._resolve_session_id(session_id)
        if not resolved:
            return None
        return self.processes.get(resolved)

    async def stop_session(self, session_id: str):
        """Stop Claude session."""
        async with self._session_lock:
            resolved = self._resolve_session_id(session_id)
            if not resolved or resolved not in self.processes:
                return
            process = self.processes[resolved]
            await process.stop()
            self._cleanup_process(process)

    async def cleanup_all(self):
        """Stop all sessions."""
        async with self._session_lock:
            for sid in list(self.processes):
                process = self.processes[sid]
                await process.stop()
                self._cleanup_process(process)
        logger.info("All sessions cleaned up")

    def get_active_sessions(self) -> List[str]:
        return list(self.processes.keys())

    async def continue_conversation(self, session_id: str, prompt: str) -> bool:
        logger.warning("continue_conversation not supported in API mode")
        return False

    def _register_cli_session(self, api_session_id: str, cli_session_id: str):
        if cli_session_id:
            self.cli_session_index[cli_session_id] = api_session_id

    def _resolve_session_id(self, session_id: str) -> Optional[str]:
        if session_id in self.processes:
            return session_id
        return self.cli_session_index.get(session_id)

    def _cleanup_process(self, process: ClaudeProcess):
        if process.session_id in self.processes:
            del self.processes[process.session_id]
        if process.cli_session_id:
            self.cli_session_index.pop(process.cli_session_id, None)


# Utility functions for project management
def create_project_directory(project_id: str) -> str:
    """Create project directory."""
    return ensure_directory_within_base(
        project_id,
        settings.project_root,
        allow_subpaths=False,
        sanitize_leaf=True,
    )


def cleanup_project_directory(project_path: str):
    """Clean up project directory."""
    try:
        import shutil

        if os.path.exists(project_path):
            shutil.rmtree(project_path)
            logger.info("Project directory cleaned up", path=project_path)
    except Exception as e:
        logger.error(
            "Failed to cleanup project directory", path=project_path, error=str(e)
        )


def validate_claude_binary() -> bool:
    """Always returns True in API-direct mode."""
    return True
