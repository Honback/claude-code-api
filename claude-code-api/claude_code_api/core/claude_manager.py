"""Claude Code CLI subprocess management.

Uses the Claude Code CLI as a subprocess to handle API calls.
The CLI manages OAuth authentication internally, so no API key
is required when the user has a Claude Max/Pro subscription.
"""

import asyncio
import json
import os
import shutil
import uuid
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional

import structlog

from claude_code_api.models.claude import (
    get_available_models,
    get_default_model,
    validate_claude_model,
)

from .config import settings
from .security import ensure_directory_within_base

logger = structlog.get_logger()


def _find_claude_binary() -> str:
    """Find the claude CLI binary."""
    env_path = os.environ.get("CLAUDE_BINARY_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    claude_path = shutil.which("claude")
    if claude_path:
        return claude_path

    # Check common npm global locations
    common_paths = [
        "/usr/local/bin/claude",
        "/usr/bin/claude",
        os.path.expanduser("~/.local/bin/claude"),
    ]
    for path in common_paths:
        if os.path.exists(path):
            return path

    return "claude"


class ClaudeProcess:
    """Manages a Claude Code CLI subprocess.

    The CLI handles OAuth authentication internally, reading credentials
    from ~/.claude/.credentials.json. No direct API key is needed for
    users with Claude Max/Pro subscriptions.
    """

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
        self.process: Optional[asyncio.subprocess.Process] = None
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
        """Start Claude CLI subprocess."""
        self.last_error = None

        claude_binary = _find_claude_binary()
        resolved_model = validate_claude_model(model) if model else get_default_model()

        cmd = [
            claude_binary,
            "-p", prompt,
            "--output-format", "stream-json",
            "--model", resolved_model,
            "--max-turns", "1",
        ]

        if system_prompt:
            cmd.extend(["--system-prompt", system_prompt])

        logger.info(
            "Starting Claude CLI subprocess",
            session_id=self.session_id,
            model=resolved_model,
            binary=claude_binary,
        )

        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.PIPE,
            )

            # CRITICAL: Close stdin immediately to prevent CLI from hanging.
            # The prompt is passed via -p flag, not stdin.
            self.process.stdin.close()

            self.is_running = True

            self.cli_session_id = str(uuid.uuid4())
            if self._on_cli_session_id:
                self._on_cli_session_id(self.cli_session_id)

            self._task = asyncio.create_task(self._read_output())
            return True

        except FileNotFoundError:
            self.last_error = (
                "Claude CLI를 찾을 수 없습니다. "
                "Docker 이미지에 @anthropic-ai/claude-code가 설치되어 있는지 확인하세요."
            )
            logger.error("Claude CLI not found", binary=claude_binary)
            return False
        except Exception as e:
            self.last_error = f"CLI 시작 실패: {e}"
            logger.error("Failed to start CLI", error=str(e))
            return False

    async def _read_output(self) -> None:
        """Read JSONL output from CLI stdout and queue messages."""
        try:
            stderr_chunks: list[bytes] = []

            # Start collecting stderr in background
            async def _drain_stderr():
                if self.process and self.process.stderr:
                    while True:
                        chunk = await self.process.stderr.read(4096)
                        if not chunk:
                            break
                        stderr_chunks.append(chunk)

            stderr_task = asyncio.create_task(_drain_stderr())

            # Read stdout line by line (JSONL)
            while self.process and self.process.stdout:
                line = await self.process.stdout.readline()
                if not line:
                    break

                line_str = line.decode("utf-8", errors="replace").strip()
                if not line_str:
                    continue

                try:
                    message = json.loads(line_str)
                    await self.output_queue.put(message)

                    # Extract session_id from messages
                    msg_sid = message.get("session_id")
                    if msg_sid and self.cli_session_id != msg_sid:
                        self.cli_session_id = msg_sid
                        if self._on_cli_session_id:
                            self._on_cli_session_id(self.cli_session_id)

                except json.JSONDecodeError:
                    logger.debug("Non-JSON line from CLI", line=line_str[:200])

            # Wait for stderr to finish
            await stderr_task

            # Wait for process to complete
            if self.process:
                await self.process.wait()
                return_code = self.process.returncode

                if return_code != 0:
                    stderr_text = b"".join(stderr_chunks).decode(
                        "utf-8", errors="replace"
                    ).strip()
                    self.last_error = f"CLI exited with code {return_code}"
                    if stderr_text:
                        # Extract meaningful error from stderr
                        error_summary = stderr_text[:500]
                        self.last_error += f": {error_summary}"
                    logger.error(
                        "CLI process failed",
                        return_code=return_code,
                        stderr=stderr_text[:500] if stderr_text else "",
                    )
                    await self.output_queue.put(
                        {
                            "type": "error",
                            "error": self.last_error,
                            "session_id": self.cli_session_id,
                        }
                    )

        except Exception as e:
            self.last_error = str(e)
            logger.error("Error reading CLI output", error=str(e))
            await self.output_queue.put(
                {
                    "type": "error",
                    "error": self.last_error,
                    "session_id": self.cli_session_id,
                }
            )
        finally:
            await self.output_queue.put(None)  # End signal
            self.is_running = False
            if self._on_end:
                self._on_end(self)

    async def get_output(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Get output from CLI process."""
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
        """No-op for non-interactive mode."""
        logger.warning(
            "send_input not supported in non-interactive mode",
            session_id=self.session_id,
        )

    async def stop(self):
        """Stop the CLI subprocess."""
        self.is_running = False
        if self.process and self.process.returncode is None:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
            except Exception:
                pass
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
    """Manages multiple Claude CLI sessions."""

    def __init__(self):
        self.processes: Dict[str, ClaudeProcess] = {}
        self.cli_session_index: Dict[str, str] = {}
        self.max_concurrent = settings.max_concurrent_sessions
        self._session_lock = asyncio.Lock()

    async def get_version(self) -> str:
        """Return CLI version string."""
        try:
            binary = _find_claude_binary()
            proc = await asyncio.create_subprocess_exec(
                binary, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            version = stdout.decode().strip()
            return f"CLI ({version})" if version else "CLI (unknown version)"
        except Exception:
            return "CLI (version check failed)"

    async def create_session(
        self,
        session_id: str,
        project_path: str,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        on_cli_session_id: Optional[Callable[[str], None]] = None,
    ) -> ClaudeProcess:
        """Create new Claude session via CLI."""
        async with self._session_lock:
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
                    process.last_error or "Failed to start CLI process"
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
        logger.warning("continue_conversation not supported in non-interactive mode")
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
        import shutil as _shutil

        if os.path.exists(project_path):
            _shutil.rmtree(project_path)
            logger.info("Project directory cleaned up", path=project_path)
    except Exception as e:
        logger.error(
            "Failed to cleanup project directory", path=project_path, error=str(e)
        )


def validate_claude_binary() -> bool:
    """Check if Claude CLI binary is available."""
    binary = _find_claude_binary()
    return shutil.which(binary) is not None or os.path.exists(binary)
