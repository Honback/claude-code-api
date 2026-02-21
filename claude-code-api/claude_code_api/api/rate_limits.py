"""Rate limits endpoint - fetches Anthropic API rate limit info from response headers."""

import json
import os
import time

import httpx
import structlog
from fastapi import APIRouter

logger = structlog.get_logger()
router = APIRouter()

_cache: dict = {}
CACHE_TTL = 60  # seconds


def _get_anthropic_api_key() -> str | None:
    """Read the Anthropic API key from config.json or environment."""
    # 1. Environment variable
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key and key.startswith("sk-ant-"):
        return key

    # 2. config.json written by Settings page
    config_path = os.path.expanduser("~/.config/claude/config.json")
    try:
        with open(config_path) as f:
            data = json.load(f)
            key = data.get("apiKey", "")
            if key and key.startswith("sk-ant-"):
                return key
    except (OSError, json.JSONDecodeError):
        pass

    return None


def _estimate_tier(rpm_limit: int) -> str:
    """Estimate Anthropic tier from requests-per-minute limit."""
    if rpm_limit >= 4000:
        return "Tier 4"
    if rpm_limit >= 2000:
        return "Tier 3"
    if rpm_limit >= 1000:
        return "Tier 2"
    return "Tier 1"


@router.get("/v1/rate-limits")
async def get_rate_limits():
    """Fetch current Anthropic API rate limits by making a minimal API call."""
    # Check cache
    if _cache.get("data") and time.time() - _cache.get("ts", 0) < CACHE_TTL:
        return _cache["data"]

    api_key = _get_anthropic_api_key()
    if not api_key:
        return {
            "error": "no_api_key",
            "message": "API 키를 설정하면 rate limit 정보를 확인할 수 있습니다.",
        }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "hi"}],
                },
            )

        headers = resp.headers
        result = {}

        for category in ("requests", "input-tokens", "output-tokens"):
            limit_key = f"anthropic-ratelimit-{category}-limit"
            remaining_key = f"anthropic-ratelimit-{category}-remaining"
            reset_key = f"anthropic-ratelimit-{category}-reset"

            limit_val = headers.get(limit_key)
            remaining_val = headers.get(remaining_key)

            if limit_val is not None:
                key = category.replace("-", "_")
                result[key] = {
                    "limit": int(limit_val),
                    "remaining": int(remaining_val) if remaining_val else None,
                    "reset": headers.get(reset_key),
                }

        # Estimate tier from RPM
        rpm = result.get("requests", {}).get("limit", 0)
        result["tier"] = _estimate_tier(rpm)
        result["cached_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        _cache["data"] = result
        _cache["ts"] = time.time()

        return result

    except httpx.TimeoutException:
        logger.warning("Anthropic API timeout when fetching rate limits")
        return {"error": "timeout", "message": "Anthropic API 요청 시간 초과"}
    except Exception as e:
        logger.error("Failed to fetch rate limits", error=str(e))
        return {"error": "fetch_failed", "message": str(e)}
