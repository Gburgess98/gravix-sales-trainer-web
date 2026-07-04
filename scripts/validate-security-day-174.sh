#!/usr/bin/env bash
# Day 174 — Security lockdown audit validation (WEB side).
set -euo pipefail

cd "$(dirname "$0")/.."

PASS=0
FAIL=0

check() {
  local name="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "✅ $name"
    PASS=$((PASS + 1))
  else
    echo "❌ $name"
    FAIL=$((FAIL + 1))
  fi
}

DOC="SECURITY_LOCKDOWN_AUDIT.md"

check "SECURITY_LOCKDOWN_AUDIT.md exists"                 test -f "$DOC"
check "doc includes Critical risks section"               grep -q "## Critical risks" "$DOC"
check "doc includes High risks section"                   grep -q "## High risks" "$DOC"
check "doc includes Medium risks section"                 grep -q "## Medium risks" "$DOC"
check "doc includes Low risks section"                    grep -q "## Low risks" "$DOC"
check "doc covers tenant isolation"                       grep -qi "tenant isolation" "$DOC"
check "doc covers upload/storage"                         grep -qi "upload" "$DOC"
check "doc covers storage access"                         grep -qi "storage" "$DOC"
check "doc covers the proxy"                              grep -qi "proxy" "$DOC"
check "doc includes Day 175 fixes"                        grep -q "Day 175 fixes" "$DOC"
check "doc includes do-not-ignore list"                   grep -qi "Do-not-ignore list" "$DOC"
check "doc records Day 174 patches"                       grep -q "Day 174 patches" "$DOC"
check "validate-tier-2b-smoke script still exists"        test -f scripts/validate-tier-2b-smoke.sh
check "validate-tier-2b-smoke npm entry still wired"      grep -q '"validate-tier-2b-smoke"' package.json

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Day 174 security validation FAILED ($FAIL failures, $PASS passed)"
  exit 1
fi
echo "✅ Day 174 security validation PASSED ($PASS checks)"
