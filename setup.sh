#!/bin/bash
set -e

echo "=== Claude Code API Platform Setup ==="

# 1. Clone claude-code-api if not exists
if [ ! -d "claude-code-api" ]; then
    echo "Cloning claude-code-api..."
    git clone https://github.com/codingworkflow/claude-code-api.git
else
    echo "claude-code-api already exists, skipping clone"
fi

# 2. Copy .env if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "Please edit .env with your ANTHROPIC_API_KEY"
fi

# 3. Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend && npm install && cd ..

# 4. Build and start
echo "Starting Docker Compose..."
docker compose up --build -d

echo ""
echo "=== Setup Complete ==="
echo "Access the app at: http://localhost"
echo "Default admin: admin@claude-platform.com / admin123"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f          # View all logs"
echo "  docker compose logs backend -f  # View backend logs"
echo "  docker compose down             # Stop all services"
