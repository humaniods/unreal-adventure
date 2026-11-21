#!/usr/bin/env bash
# Local multiplayer for testing: LiveKit (voice) in dev mode and the trek server, which also serves the game.
# The server also serves the game: open http://127.0.0.1:8787/ in two browsers (or one normal + one private window).
set -euo pipefail
cd "$(dirname "$0")"
trap 'kill 0' EXIT
# Claude key for chatting with bots (ANTHROPIC_API_KEY): .env next to this script, never committed
if [ -f .env ]; then set -a; . ./.env; set +a; else echo 'No .env: bots answer with short written lines (see README)'; fi
livekit-server --dev --bind 0.0.0.0 > /tmp/triund-livekit.log 2>&1 &
uv run uvicorn triund_server.app:app --host 0.0.0.0 --port 8787 &
wait
