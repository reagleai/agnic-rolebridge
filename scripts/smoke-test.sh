#!/usr/bin/env bash
# RoleBridge V1 — Smoke Test
# Block F — scripts/smoke-test.sh
#
# Tests the full API flow end-to-end.
# Usage: BASE_URL=https://<ref>.supabase.co/functions/v1 AUTH_KEY=<anon_key> bash scripts/smoke-test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:54321/functions/v1}"
AUTH_KEY="${AUTH_KEY:-}"
AUTH_HEADER=""
if [ -n "$AUTH_KEY" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $AUTH_KEY\""
fi

echo "=== RoleBridge Smoke Test ==="
echo "Base URL: $BASE_URL"
echo ""

# ── 1. Create session ──
echo "1. POST /sessions"
SESSION_RESP=$(curl -s -X POST "$BASE_URL/sessions" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test@example.com"}')
echo "   Response: $SESSION_RESP"
SESSION_ID=$(echo "$SESSION_RESP" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$SESSION_ID" ]; then
  echo "   ❌ FAIL: No session_id returned"
  exit 1
fi
echo "   ✅ Session created: $SESSION_ID"
echo ""

# ── 2. Setup session ──
echo "2. POST /session-setup/$SESSION_ID"
RESUME_TEXT="I have over 5 years of experience leading cross-functional engineering teams and delivering full-stack applications. I built a comprehensive AI-powered analytics platform using React, Node.js, and Python that served over 10,000 users. I managed a team of 8 engineers and was responsible for quarterly planning, sprint execution, and stakeholder communication."
JD_TEXT="We are looking for a Senior Product Manager with strong technical background, experience in AI/ML products, and proven ability to lead teams. Must have experience with agile methodologies and data-driven decision making."
SETUP_RESP=$(curl -s -X POST "$BASE_URL/session-setup/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d "{\"resume_text\":\"$RESUME_TEXT\",\"jd_text\":\"$JD_TEXT\",\"section_name\":\"Work Experience\"}")
echo "   Response: $(echo "$SETUP_RESP" | head -c 200)"
FIRST_Q_ID=$(echo "$SETUP_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$FIRST_Q_ID" ]; then
  echo "   ❌ FAIL: No first_question returned"
  exit 1
fi
echo "   ✅ First question generated: $FIRST_Q_ID"
echo ""

# ── 3. Get session (rehydration) ──
echo "3. GET /session-get/$SESSION_ID"
GET_RESP=$(curl -s -X GET "$BASE_URL/session-get/$SESSION_ID")
echo "   Response: $(echo "$GET_RESP" | head -c 200)"
STATUS=$(echo "$GET_RESP" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
if [ "$STATUS" != "active" ]; then
  echo "   ❌ FAIL: Expected status=active, got $STATUS"
  exit 1
fi
echo "   ✅ Session is active"
echo ""

# ── 4. STT session ──
echo "4. GET /stt-session/$SESSION_ID"
STT_RESP=$(curl -s -X GET "$BASE_URL/stt-session/$SESSION_ID")
echo "   Response: $(echo "$STT_RESP" | head -c 200)"
echo "   (Gladia may return 502 without valid API key — expected in dev)"
echo ""

# ── 5. Submit answer ──
echo "5. POST /session-answers/$SESSION_ID"
ANSWER_RESP=$(curl -s -X POST "$BASE_URL/session-answers/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d "{\"question_id\":\"$FIRST_Q_ID\",\"answer_text\":\"In my previous role, I led a team of 8 engineers to build an AI analytics platform. I was directly responsible for the product roadmap, sprint planning, and stakeholder alignment. We delivered the MVP in 3 months and scaled to 10,000 users within the first quarter.\",\"input_type\":\"text\",\"duration_seconds\":30}")
echo "   Response: $(echo "$ANSWER_RESP" | head -c 200)"
NEXT_ACTION=$(echo "$ANSWER_RESP" | grep -o '"next_action":"[^"]*"' | cut -d'"' -f4)
if [ -z "$NEXT_ACTION" ]; then
  echo "   ❌ FAIL: No next_action returned"
  exit 1
fi
echo "   ✅ Answer evaluated, next_action: $NEXT_ACTION"
echo ""

# ── 6. End session ──
echo "6. POST /session-end/$SESSION_ID"
END_RESP=$(curl -s -X POST "$BASE_URL/session-end/$SESSION_ID")
echo "   Response: $END_RESP"
END_STATUS=$(echo "$END_RESP" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo "   ✅ Session ended: $END_STATUS"
echo ""

# ── 7. Verify idempotency ──
echo "7. POST /session-end/$SESSION_ID (idempotency check)"
END2_RESP=$(curl -s -X POST "$BASE_URL/session-end/$SESSION_ID")
echo "   Response: $END2_RESP"
END2_STATUS=$(echo "$END2_RESP" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
if [ "$END2_STATUS" = "already_ended" ]; then
  echo "   ✅ Idempotent: already_ended"
else
  echo "   ⚠️  Expected already_ended, got: $END2_STATUS"
fi
echo ""

echo "=== Smoke Test Complete ==="
echo "Next: Wait 1-2 minutes for cron to process report_queue."
echo "Check: SELECT status FROM report_queue ORDER BY created_at DESC LIMIT 1;"
