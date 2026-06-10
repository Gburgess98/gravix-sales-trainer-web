#!/usr/bin/env bash
# Validates that the Day 89 Sprint 4 manager value audit deliverables exist.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILES=(
  "SPRINT_4_MANAGER_VALUE_AUDIT.md"
  "SPRINT_4_ROADMAP.md"
  "DAY_90_IMPLEMENTATION_PLAN.md"
)

fail=0
for f in "${FILES[@]}"; do
  path="$ROOT/$f"
  if [[ -s "$path" ]]; then
    echo "OK    $f"
  else
    echo "MISS  $f (missing or empty)"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 manager audit validation FAILED"
  exit 1
fi
echo "Sprint 4 manager audit validation PASSED"
