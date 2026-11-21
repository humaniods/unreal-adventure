#!/usr/bin/env bash
# Share the game running on this laptop (./dev.sh, port 8787) with friends anywhere, through a free Cloudflare quick
# tunnel. Prints a public https link; send that (not 127.0.0.1). The link works only while this script and dev.sh
# run, and it changes every time. Voice needs the online server (../deploy); walking together and chat work.
set -euo pipefail
LOG=$(mktemp)
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8787 >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f "$LOG"' EXIT
for _ in $(seq 60); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break; sleep 1
done
[ -z "${URL:-}" ] && { echo "Tunnel did not start:"; cat "$LOG"; exit 1; }
echo; echo "  Open this yourself and send it to your friends:  $URL/"; echo "  (Ctrl+C stops sharing)"; echo
wait $PID
