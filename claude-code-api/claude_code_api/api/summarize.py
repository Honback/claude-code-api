"""Summarization endpoint - calls Anthropic API directly to generate conversation summaries."""

import httpx
import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from claude_code_api.api.rate_limits import _get_anthropic_api_key

logger = structlog.get_logger()
router = APIRouter()


class SummarizeRequest(BaseModel):
    prompt: str
    max_tokens: int = 1024
    model: str = "claude-haiku-4-5-20251001"


class SummarizeResponse(BaseModel):
    summary: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest):
    """Generate a conversation summary using Anthropic API directly."""
    api_key = _get_anthropic_api_key()
    if not api_key:
        logger.warning("Summarization skipped: no API key configured")
        return SummarizeResponse(
            summary="",
            model=request.model,
        )

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": request.model,
                    "max_tokens": request.max_tokens,
                    "messages": [{"role": "user", "content": request.prompt}],
                },
            )

        if resp.status_code != 200:
            logger.error(
                "Anthropic API error during summarization",
                status=resp.status_code,
                body=resp.text[:500],
            )
            return SummarizeResponse(summary="", model=request.model)

        data = resp.json()
        summary_text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                summary_text += block.get("text", "")

        usage = data.get("usage", {})

        return SummarizeResponse(
            summary=summary_text,
            model=data.get("model", request.model),
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )

    except httpx.TimeoutException:
        logger.warning("Summarization timeout")
        return SummarizeResponse(summary="", model=request.model)
    except Exception as e:
        logger.error("Summarization failed", error=str(e))
        return SummarizeResponse(summary="", model=request.model)
