#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Endpoint Test Script — Realtime Media Backend
#
# Prerequisites:
#   1. Start the backend:  npm run start:dev
#   2. (Optional) Start infra: docker compose -f docker-compose.dev.yml up -d
#
# Usage:
#   bash test-endpoints.sh
# ──────────────────────────────────────────────────────────────────────

BASE="http://localhost:3001"
PASS=0
FAIL=0
SESSION_ID=""

green() { echo -e "\033[32m✔ $1\033[0m"; }
red()   { echo -e "\033[31m✘ $1\033[0m"; }
header(){ echo -e "\n\033[1m── $1 ──\033[0m"; }

check() {
  local expected=$1 actual=$2 label=$3
  if [ "$actual" = "$expected" ]; then
    green "$label (got $actual)"
    PASS=$((PASS + 1))
  else
    red "$label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# ─── 1. Health Checks ────────────────────────────────────────────────
header "Health Checks"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
check 200 "$STATUS" "GET /health"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health/ready")
check 200 "$STATUS" "GET /health/ready"

HEALTH=$(curl -s "$BASE/health")
echo "  Response: $HEALTH" | head -c 200
echo

# ─── 2. Service Info ─────────────────────────────────────────────────
header "Service Info"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api")
check 200 "$STATUS" "GET /api"

# ─── 3. Swagger Docs ────────────────────────────────────────────────
header "Swagger UI"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/docs")
check 200 "$STATUS" "GET /api/docs"

# ─── 4. Create Session ──────────────────────────────────────────────
header "Create Session (POST /api/sessions)"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"initiatorId":"test-user-001","mode":"SPEECH"}')

STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
check 201 "$STATUS" "POST /api/sessions (SPEECH mode)"

SESSION_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Session ID: $SESSION_ID"

# Create second session (different mode)
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"initiatorId":"test-user-002","mode":"SIGN_LANGUAGE"}')
STATUS2=$(echo "$RESPONSE2" | tail -1)
check 201 "$STATUS2" "POST /api/sessions (SIGN_LANGUAGE mode)"

# Create third session
RESPONSE3=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"initiatorId":"test-user-003","mode":"HYBRID"}')
STATUS3=$(echo "$RESPONSE3" | tail -1)
check 201 "$STATUS3" "POST /api/sessions (HYBRID mode)"

# Invalid mode
RESPONSE_ERR=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"initiatorId":"test","mode":"INVALID"}')
STATUS_ERR=$(echo "$RESPONSE_ERR" | tail -1)
check 400 "$STATUS_ERR" "POST /api/sessions (invalid mode → 400)"

# Missing fields
RESPONSE_ERR2=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"mode":"SPEECH"}')
STATUS_ERR2=$(echo "$RESPONSE_ERR2" | tail -1)
check 400 "$STATUS_ERR2" "POST /api/sessions (missing initiatorId → 400)"

# ─── 5. Get Session ──────────────────────────────────────────────────
header "Get Session (GET /api/sessions/:id)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sessions/$SESSION_ID")
check 200 "$STATUS" "GET /api/sessions/$SESSION_ID"

SESSION_BODY=$(curl -s "$BASE/api/sessions/$SESSION_ID")
echo "  State: $(echo "$SESSION_BODY" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sessions/nonexistent")
check 404 "$STATUS" "GET /api/sessions/nonexistent → 404"

# ─── 6. Get Participants ────────────────────────────────────────────
header "Get Participants (GET /api/sessions/:id/participants)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sessions/$SESSION_ID/participants")
check 200 "$STATUS" "GET /api/sessions/:id/participants"

PARTS=$(curl -s "$BASE/api/sessions/$SESSION_ID/participants")
echo "  Participants: $PARTS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sessions/nonexistent/participants")
check 404 "$STATUS" "GET /api/sessions/nonexistent/participants → 404"

# ─── 7. Get Metrics ─────────────────────────────────────────────────
header "Get Metrics (GET /api/sessions/:id/metrics)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sessions/$SESSION_ID/metrics")
check 200 "$STATUS" "GET /api/sessions/:id/metrics"

METRICS=$(curl -s "$BASE/api/sessions/$SESSION_ID/metrics")
echo "  Metrics: $METRICS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sessions/nonexistent/metrics")
check 404 "$STATUS" "GET /api/sessions/nonexistent/metrics → 404"

# ─── 8. Documentation Endpoints ─────────────────────────────────────
header "Documentation Endpoints"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/signaling/events")
check 200 "$STATUS" "GET /api/signaling/events"

SIGNALING=$(curl -s "$BASE/api/signaling/events")
echo "  Client→Server events: $(echo "$SIGNALING" | grep -o '"join-room"' | head -1)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/egress/events")
check 200 "$STATUS" "GET /api/egress/events"

EGRESS=$(curl -s "$BASE/api/egress/events")
echo "  Audio topic: $(echo "$EGRESS" | grep -o '"topic":"[^"]*"' | head -1)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/sessions/events")
check 200 "$STATUS" "GET /api/sessions/events"

KAFKA=$(curl -s "$BASE/api/sessions/events")
echo "  Consumed topics: $(echo "$KAFKA" | grep -o '"session\.[^"]*"' | head -2)"

# ─── 9. End Session ─────────────────────────────────────────────────
header "End Session (DELETE /api/sessions/:id)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/sessions/$SESSION_ID")
check 200 "$STATUS" "DELETE /api/sessions/$SESSION_ID"

# Try to delete again — should 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/sessions/$SESSION_ID")
check 404 "$STATUS" "DELETE /api/sessions/$SESSION_ID (already ended → 404)"

# ─── 10. 404 for unknown routes ──────────────────────────────────────
header "Unknown Routes"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/nonexistent")
check 404 "$STATUS" "GET /api/nonexistent → 404"

# ─── Summary ──────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo ""
echo "═══════════════════════════════════════"
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
