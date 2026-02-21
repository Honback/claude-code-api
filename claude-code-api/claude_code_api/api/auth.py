"""OAuth authentication endpoints - direct PKCE flow bypassing CLI's Ink UI."""

import asyncio
import base64
import hashlib
import json
import os
import secrets
import time
from datetime import datetime
from urllib.parse import unquote

import httpx
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = structlog.get_logger()

router = APIRouter(prefix="/auth", tags=["auth"])

# OAuth constants (extracted from Claude CLI binary)
CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
# Automatic redirect to our own nginx (matching CLI's http://localhost:PORT/callback pattern)
REDIRECT_PORT = os.environ.get("OAUTH_REDIRECT_PORT", "9090")
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}/callback"
# Fallback manual redirect
MANUAL_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback"
SCOPES = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers"

# Global state for pending OAuth flow
_oauth_state: dict | None = None


class LoginStartRequest(BaseModel):
    serverUrl: str | None = None


class LoginStartResponse(BaseModel):
    url: str
    message: str
    manual: bool = False


class LoginCodeRequest(BaseModel):
    code: str


class AuthStatusResponse(BaseModel):
    logged_in: bool
    auth_method: str
    api_provider: str | None = None
    message: str | None = None


def _credentials_path() -> str:
    """Get the path to Claude's credentials file."""
    config_dir = os.environ.get("CLAUDE_CONFIG_DIR", os.path.join(os.path.expanduser("~"), ".claude"))
    return os.path.join(config_dir, ".credentials.json")


def _generate_pkce() -> tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge."""
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


@router.get("/status")
async def auth_status() -> AuthStatusResponse:
    """Check auth status by reading credential files (no CLI needed)."""
    # 1. Check OAuth credentials
    cred_path = _credentials_path()
    if os.path.exists(cred_path):
        try:
            with open(cred_path) as f:
                creds = json.load(f)
            oauth = creds.get("claudeAiOauth", {})
            if oauth.get("accessToken"):
                expires_at = oauth.get("expiresAt", 0)
                now_ms = int(time.time() * 1000)

                if expires_at > 0 and expires_at <= now_ms:
                    # Token expired
                    expired_time = datetime.fromtimestamp(expires_at / 1000)
                    expired_str = expired_time.strftime("%Y-%m-%d %H:%M:%S")
                    return AuthStatusResponse(
                        logged_in=False,
                        auth_method="oauth_expired",
                        api_provider="claude.ai",
                        message=f"{expired_str}에 만료됨. 다시 로그인하세요.",
                    )

                return AuthStatusResponse(
                    logged_in=True,
                    auth_method="oauth",
                    api_provider="claude.ai",
                )
        except Exception:
            pass

    # 2. Check API key in config
    config_path = os.path.join(os.path.expanduser("~"), ".config", "claude", "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                config = json.load(f)
            key = config.get("apiKey", "")
            if key and key.startswith("sk-"):
                return AuthStatusResponse(
                    logged_in=True,
                    auth_method="api_key",
                    api_provider="anthropic",
                )
        except Exception:
            pass

    # 3. Check environment variable
    env_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if env_key and env_key.startswith("sk-"):
        return AuthStatusResponse(
            logged_in=True,
            auth_method="api_key",
            api_provider="anthropic",
        )

    return AuthStatusResponse(logged_in=False, auth_method="none")


@router.post("/login/start")
async def login_start(request: LoginStartRequest = LoginStartRequest()) -> LoginStartResponse:
    """Start OAuth login - generate PKCE and return authorize URL.

    Uses the provided serverUrl for redirect, or falls back to localhost.
    """
    global _oauth_state

    code_verifier, code_challenge = _generate_pkce()
    state = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")

    from urllib.parse import urlencode

    # Always use localhost redirect URI for reliable token exchange.
    # - localhost access: nginx handles callback automatically
    # - remote access: redirect fails on user's machine, but URL bar shows
    #   the full URL with code parameter. User copies and pastes it.
    is_localhost = not request.serverUrl or "localhost" in request.serverUrl or "127.0.0.1" in request.serverUrl
    redirect_uri = REDIRECT_URI

    params = {
        "code": "true",  # CLI always includes this
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": SCOPES,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }

    url = f"{AUTHORIZE_URL}?{urlencode(params)}"

    _oauth_state = {
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
        "state": state,
        "started_at": time.time(),
    }

    logger.info("OAuth flow started", state=state[:8] + "...", redirect_uri=redirect_uri, manual=not is_localhost)

    if is_localhost:
        message = "브라우저에서 로그인하면 자동으로 인증이 완료됩니다."
    else:
        message = "브라우저에서 로그인 후, 빈 페이지의 URL 바에서 주소 전체를 복사하여 아래에 붙여넣으세요."

    return LoginStartResponse(
        url=url,
        message=message,
        manual=not is_localhost,
    )


@router.post("/login/code")
async def login_code(request: LoginCodeRequest):
    """Exchange the authentication code for tokens and save credentials."""
    global _oauth_state

    if not _oauth_state:
        raise HTTPException(
            status_code=400,
            detail="로그인 프로세스가 없습니다. 먼저 'OAuth 로그인 시작'을 클릭하세요.",
        )

    # Extract code from input - user may paste full URL or just the code
    raw_code = request.code.strip()

    # If user pasted the full callback URL, extract the code parameter
    if "code=" in raw_code and ("localhost" in raw_code or "callback" in raw_code):
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(raw_code)
        qs = parse_qs(parsed.query)
        if "code" in qs:
            raw_code = qs["code"][0]
            logger.info("Extracted code from pasted URL", code_length=len(raw_code))

    code = unquote(raw_code.strip())  # URL-decode in case callback page URL-encoded it
    # Remove any non-printable characters or stray whitespace
    code = "".join(c for c in code if c.isprintable() and c != " ")

    code_verifier = _oauth_state["code_verifier"]
    redirect_uri = _oauth_state.get("redirect_uri", REDIRECT_URI)
    state = _oauth_state["state"]
    elapsed = time.time() - _oauth_state["started_at"]

    logger.info(
        "Exchanging auth code for tokens",
        raw_length=len(raw_code),
        cleaned_length=len(code),
        code_prefix=code[:12] + "..." if len(code) > 12 else code,
        code_suffix="..." + code[-4:] if len(code) > 4 else "",
        verifier_length=len(code_verifier),
        verifier_prefix=code_verifier[:8] + "...",
        redirect_uri=redirect_uri,
        elapsed_sec=round(elapsed),
    )

    try:
        # Token exchange matching CLI's axios behavior exactly
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": CLIENT_ID,
            "code_verifier": code_verifier,
            "state": state,
        }

        logger.info("Token exchange request", url=TOKEN_URL, redirect_uri=redirect_uri, client_id=CLIENT_ID)

        resp = None
        async with httpx.AsyncClient(timeout=30) as client:
            # Attempt 1: JSON (matching CLI's axios behavior)
            resp = await client.post(
                TOKEN_URL,
                json=token_data,
                headers={"Content-Type": "application/json"},
            )

            logger.info("JSON attempt result", status=resp.status_code)

            # If JSON fails with 400 or 401, try form-urlencoded (standard OAuth)
            if resp.status_code in (400, 401):
                logger.info("JSON failed, trying form-urlencoded", status=resp.status_code)
                # Remove state for form-urlencoded attempt (strict OAuth compliance)
                form_data = {k: v for k, v in token_data.items() if k != "state"}
                resp = await client.post(
                    TOKEN_URL,
                    data=form_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                logger.info("Form-urlencoded attempt result", status=resp.status_code)

        if resp.status_code != 200:
            error_text = resp.text[:500]
            logger.error(
                "Token exchange failed",
                status=resp.status_code,
                body=error_text,
                code_length=len(code),
                code_hex_prefix=code[:20].encode().hex(),
            )
            # Don't clear oauth_state on failure - let user retry with the same PKCE
            return {
                "success": False,
                "message": f"토큰 교환 실패 (HTTP {resp.status_code})",
                "debug": error_text,
                "diagnostic": {
                    "code_length": len(code),
                    "code_prefix": code[:8] + "..." if len(code) > 8 else code,
                    "elapsed_seconds": round(elapsed),
                    "redirect_uri": redirect_uri,
                    "hint": "콜백 페이지에서 Authentication Code를 정확히 복사했는지 확인하세요. 코드 앞뒤 공백이 없어야 합니다.",
                },
            }

        tokens = resp.json()
        logger.info("Tokens received", has_access=bool(tokens.get("access_token")),
                     has_refresh=bool(tokens.get("refresh_token")))

        # Save tokens to credentials file
        cred_path = _credentials_path()
        cred_dir = os.path.dirname(cred_path)
        os.makedirs(cred_dir, exist_ok=True)

        # Read existing credentials
        existing = {}
        if os.path.exists(cred_path):
            try:
                with open(cred_path, "r") as f:
                    existing = json.load(f)
            except Exception:
                pass

        # Calculate expiration
        expires_in = tokens.get("expires_in", 3600)
        expires_at = int(time.time() + expires_in) * 1000  # milliseconds

        # Store in the format Claude CLI expects
        existing["claudeAiOauth"] = {
            "accessToken": tokens["access_token"],
            "refreshToken": tokens.get("refresh_token"),
            "expiresAt": expires_at,
            "scopes": tokens.get("scope", SCOPES).split(" ") if isinstance(tokens.get("scope", SCOPES), str) else tokens.get("scope", []),
        }

        with open(cred_path, "w") as f:
            json.dump(existing, f)
        os.chmod(cred_path, 0o600)

        logger.info("Credentials saved", path=cred_path)

        _oauth_state = None

        # Verify auth status
        status = await auth_status()
        logger.info("Auth status after save", logged_in=status.logged_in, method=status.auth_method)

        if status.logged_in:
            return {"success": True, "message": "OAuth 로그인 성공!", "auth_method": status.auth_method}
        else:
            return {
                "success": True,
                "message": "토큰이 저장되었습니다. CLI가 인식하지 못할 수 있으니 컨테이너를 재시작해보세요.",
                "tokens_saved": True,
            }

    except httpx.HTTPError as e:
        logger.error("HTTP error during token exchange", error=str(e))
        raise HTTPException(status_code=502, detail=f"토큰 교환 중 네트워크 오류: {str(e)}")
    except Exception as e:
        logger.error("Failed to exchange auth code", error=str(e))
        _oauth_state = None
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout")
async def logout():
    """Logout by removing credential files."""
    try:
        cred_path = _credentials_path()
        if os.path.exists(cred_path):
            os.remove(cred_path)
        return {"success": True, "message": "로그아웃 완료"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
