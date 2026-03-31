#!/bin/bash
# Start clawcode with a local OpenAI-compatible proxy
# Usage: ./start.sh [args...]
#   ./start.sh              - interactive mode
#   ./start.sh -p "prompt"  - print mode
#   ./start.sh --help       - show help

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROXY_PORT=4010

# Set your API key before running. LLM_API_KEY is accepted as a fallback.
export API_KEY="${API_KEY:-${LLM_API_KEY:-}}"
export API_KEY="${API_KEY:?Set API_KEY before running}"

# Optional upstream base URL override.
export API_BASE_URL="${API_BASE_URL:-${LLM_BASE_URL:-https://api.openai.com/v1}}"

# Point Claude Code at our local proxy
export ANTHROPIC_BASE_URL="http://localhost:$PROXY_PORT"
export ANTHROPIC_API_KEY="not-needed-proxy-handles-auth"
export DISABLE_AUTOUPDATER=1

cleanup() {
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null
}
trap cleanup EXIT

# Start Bun proxy
echo "Starting local API proxy..."
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
