#!/usr/bin/env bash
# Validates the Day 100 Tier 2A audit + architecture deliverables exist.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILES=(
  "TIER_2A_SPARRING_BRAIN_AUDIT.md"
  "TIER_2A_ARCHITECTURE.md"
  "TIER_2A_DATA_MODEL_PLAN.md"
  "TIER_2A_DAY_101_IMPLEMENTATION_PLAN.md"
)

fail=0
for f in "${FILES[@]}"; do
  if [[ -s "$ROOT/$f" ]]; then
    echo "OK    $f"
  else
    echo "MISS  $f (missing or empty)"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "Tier 2A Day 100 validation FAILED"
  exit 1
fi
echo "Tier 2A Day 100 validation PASSED"
