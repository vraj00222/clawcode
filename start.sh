#!/bin/bash
# Start clawcode with Novita AI backend
# Usage: ./start.sh [args...]
#   ./start.sh              - interactive mode
#   ./start.sh -p "prompt"  - print mode
#   ./start.sh --help       - show help

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROXY_PORT=4010

# Set your Novita AI key here or export NOVITA_API_KEY before running
export NOVITA_API_KEY="${NOVITA_API_KEY:?Set NOVITA_API_KEY before running}"

# Point Claude Code at our local proxy
export ANTHROPIC_BASE_URL="http://localhost:$PROXY_PORT"
export ANTHROPIC_API_KEY="not-needed-proxy-handles-auth"
export DISABLE_AUTOUPDATER=1

cleanup() {
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null
}
trap cleanup EXIT

# Start Bun proxy
echo "Starting Novita AI proxy..."
bun run "$SCRIPT_DIR/proxy.ts" &
PROXY_PID=$!

# Wait for proxy
for i in $(seq 1 15); do
  curl -s "http://localhost:$PROXY_PORT/health" > /dev/null 2>&1 && break
  sleep 0.3
done
echo ""

# Run clawcode
bun run "$SCRIPT_DIR/dist/cli.js" "$@"
