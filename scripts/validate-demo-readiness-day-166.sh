#!/usr/bin/env bash
# Validates the Day 166 live upload → Review Queue proof and the demo-data fix it
# exposed: applyHierarchyFilters must never emit .eq("office_id", null) — seeded
# demo-org managers have no office, and eq-null is a Postgres uuid error (500 on
# every manager endpoint). Office managers without an office now fall back to
# company scope. Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPLOAD="$WEB_ROOT/src/app/upload/page.tsx"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
API_MANAGER="$WEB_ROOT/../gravix-sales-trainer-api/src/routes/manager.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 166 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── API: null-office hierarchy fallback (skip gracefully if API repo absent) ──
if [[ -f "$API_MANAGER" ]]; then
  grep -q 'if (user.office_id) return query.eq("office_id", user.office_id);' "$API_MANAGER" 2>/dev/null
  check "applyHierarchyFilters guards office_id before .eq" $?

  grep -q 'if (user.company_id) return query.eq("company_id", user.company_id);' "$API_MANAGER" 2>/dev/null
  check "office manager without office falls back to company scope" $?

  if grep -qE 'return query\.eq\("office_id", user\.office_id\);\s*$' "$API_MANAGER" 2>/dev/null && \
     ! grep -q 'if (user.office_id)' "$API_MANAGER" 2>/dev/null; then
    check "no unguarded .eq(\"office_id\", null) filter remains" 1
  else
    check "no unguarded .eq(\"office_id\", null) filter remains" 0
  fi
else
  echo "SKIP  API repo not found next to web repo — API-side checks skipped"
fi

# ── upload flow proof surface (Day 165 copy still intact) ──
grep -q "Call ready for review." "$UPLOAD" 2>/dev/null
check "/upload still shows \"Call ready for review.\"" $?

grep -q "coaching?tab=review" "$UPLOAD" 2>/dev/null
check "/upload Review Queue CTA still deep-links to /coaching?tab=review" $?

# ── docs ──
grep -q "Day 166" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 166" $?

# Day 166 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b|manager-dashboard|demo-readiness)-day-1[0-6][0-5]' "$0" 2>/dev/null; then
  check "Day 166 does not recursively invoke an older day" 1
else
  check "Day 166 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added in the upload flow.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$UPLOAD" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path sneaked into the upload page.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$UPLOAD" 2>/dev/null; then
  check "no LLM on live hot path" 1
else
  check "no LLM on live hot path" 0
fi

if [[ "$fail" == "1" ]]; then
  echo "Demo Readiness Day 166 validation FAILED"
  exit 1
fi
echo "Demo Readiness Day 166 validation PASSED"
