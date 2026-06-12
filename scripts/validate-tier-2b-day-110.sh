#!/usr/bin/env bash
# Validates the Day 110 Tier 2B audit + architecture deliverables exist.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILES=(
  "TIER_2B_WHISPERER_AUDIT.md"
  "TIER_2B_ARCHITECTURE.md"
  "TIER_2B_DATA_MODEL_PLAN.md"
  "TIER_2B_DAY_111_IMPLEMENTATION_PLAN.md"
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
  echo "Tier 2B Day 110 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 110 validation PASSED"
