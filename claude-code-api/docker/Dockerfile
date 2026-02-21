FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime + build dependencies + Node.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git \
    build-essential libffi-dev libssl-dev pkg-config \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally (handles OAuth internally)
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user
RUN useradd -m -s /bin/bash claudeuser
WORKDIR /home/claudeuser/app

# Copy and install Python dependencies first (better caching)
COPY pyproject.toml setup.py setup.cfg ./
COPY claude_code_api/__init__.py claude_code_api/__init__.py
COPY claude_code_api/config/ claude_code_api/config/
RUN chown -R claudeuser:claudeuser /home/claudeuser/app

USER claudeuser
RUN pip install --no-cache-dir --user -e .

# Copy remaining source
COPY --chown=claudeuser:claudeuser . /home/claudeuser/app

ENV PATH="/home/claudeuser/.local/bin:${PATH}"

# Create config directories
RUN mkdir -p /home/claudeuser/.config/claude /home/claudeuser/.claude

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "-m", "claude_code_api.main"]
