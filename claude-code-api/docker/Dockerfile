FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    python3 \
    python3-pip \
    python3-venv \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash claudeuser && \
    echo "claudeuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up application directory
WORKDIR /home/claudeuser/app
COPY . /home/claudeuser/app
RUN chown -R claudeuser:claudeuser /home/claudeuser/app

USER claudeuser

# Install Claude CLI using the official installer (no npm required)
RUN curl -fsSL https://claude.ai/install.sh | bash

# Create virtualenv and install dependencies
RUN python3 -m venv /home/claudeuser/venv && \
    /home/claudeuser/venv/bin/pip install --upgrade pip setuptools wheel && \
    /home/claudeuser/venv/bin/pip install -e . --use-pep517 || \
    /home/claudeuser/venv/bin/pip install -e .

ENV PATH="/home/claudeuser/venv/bin:/home/claudeuser/.local/bin:/home/claudeuser/.bun/bin:${PATH}"

# Create Claude config and workspace directories
RUN mkdir -p /home/claudeuser/.config/claude /home/claudeuser/app/workspace

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

RUN cat <<'EOF' > /home/claudeuser/entrypoint.sh
#!/usr/bin/env bash
set -euo pipefail

auth_ready=false

# 1. Check OAuth auth (from 'claude auth login' - stored in ~/.claude/)
auth_status=$(timeout 5 "$HOME/.local/bin/claude" auth status 2>/dev/null || echo '{}')
auth_method=$(echo "$auth_status" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('authMethod',''))" 2>/dev/null || echo "")
logged_in=$(echo "$auth_status" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('loggedIn',False)).lower())" 2>/dev/null || echo "false")

if [ "$logged_in" = "true" ] && [ "$auth_method" = "oauth" ]; then
  echo "Authenticated via OAuth (Claude Max/Pro subscription)"
  auth_ready=true
fi

# 2. Check config.json from shared volume (written by Settings page)
if [ "$auth_ready" != "true" ] && [ -f "$HOME/.config/claude/config.json" ]; then
  api_key=$(python3 -c "import json; print(json.load(open('$HOME/.config/claude/config.json')).get('apiKey',''))" 2>/dev/null || echo "")
  if [ -n "$api_key" ] && [ "$api_key" != "your_anthropic_api_key_here" ]; then
    echo "Using API key from config.json"
    auth_ready=true
  fi
fi

# 3. Fallback: write config from ANTHROPIC_API_KEY env var
if [ "$auth_ready" != "true" ] && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  if echo "${ANTHROPIC_API_KEY}" | grep -q "^sk-ant-"; then
    echo "Configuring Claude Code with API key from environment..."
    python3 - <<'PY'
import json, os
from pathlib import Path
config_dir = Path.home() / ".config" / "claude"
config_dir.mkdir(parents=True, exist_ok=True)
with (config_dir / "config.json").open("w") as f:
    json.dump({"apiKey": os.environ["ANTHROPIC_API_KEY"], "autoUpdate": False}, f)
PY
    auth_ready=true
  fi
fi

if [ "$auth_ready" != "true" ]; then
  echo "============================================"
  echo "  인증이 설정되지 않았습니다."
  echo ""
  echo "  방법 1) OAuth 로그인 (API 키 불필요):"
  echo "    docker exec -it \$(hostname) claude auth login"
  echo "    → 브라우저에서 로그인하면 완료"
  echo ""
  echo "  방법 2) API 키 설정:"
  echo "    Settings 페이지: http://localhost:9090/settings"
  echo "============================================"
fi

echo "Starting API server..."
cd /home/claudeuser/app
exec python3 -m claude_code_api.main
EOF
RUN chmod +x /home/claudeuser/entrypoint.sh

ENTRYPOINT ["/home/claudeuser/entrypoint.sh"]
