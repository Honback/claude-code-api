FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash claudeuser
WORKDIR /home/claudeuser/app
COPY . /home/claudeuser/app
RUN chown -R claudeuser:claudeuser /home/claudeuser/app

USER claudeuser

# Install Python dependencies
RUN pip install --no-cache-dir --user -e . 2>/dev/null || \
    pip install --no-cache-dir --user -e .

ENV PATH="/home/claudeuser/.local/bin:${PATH}"

# Create config directories
RUN mkdir -p /home/claudeuser/.config/claude /home/claudeuser/.claude

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "-m", "claude_code_api.main"]
