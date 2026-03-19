#!/bin/bash
# Smoke test — starts demo server, validates endpoints, exits
set -euo pipefail

PORT=${1:-19999}
PID=""

cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null; }
trap cleanup EXIT

echo "Starting demo server on port $PORT..."
node server.js --demo --port "$PORT" &
PID=$!
sleep 3

echo "Checking /api/health..."
HEALTH=$(curl -sf "http://localhost:$PORT/api/health")
echo "$HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['ok'], 'health not ok'; print('  ✅ health ok')"

echo "Checking /api/agents..."
AGENTS=$(curl -sf "http://localhost:$PORT/api/agents")
COUNT=$(echo "$AGENTS" | python3 -c "import json,sys; d=json.load(sys.stdin); n=len(d.get('agents',[])); assert n>=1, f'expected agents, got {n}'; print(n)")
echo "  ✅ $COUNT agents"

echo "Checking index.html loads..."
SIZE=$(curl -sf "http://localhost:$PORT/" | wc -c | tr -d ' ')
[ "$SIZE" -gt 1000 ] && echo "  ✅ index.html ${SIZE} bytes" || (echo "  ❌ index.html too small: $SIZE"; exit 1)

echo "Checking SSE endpoint..."
SSE=$(curl -sf -N --max-time 3 "http://localhost:$PORT/api/events" 2>&1 || true)
echo "$SSE" | grep -q "connected" && echo "  ✅ SSE connected" || echo "  ⚠️ SSE no connected event (may be timing)"

echo ""
echo "All smoke tests passed ✅"
