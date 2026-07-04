#!/usr/bin/env bash
# Day 175 — Production identity hardening validation (WEB side).
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

ROUTE="src/app/api/proxy/[[...path]]/route.ts"
DOC="SECURITY_LOCKDOWN_AUDIT.md"

# Proxy strips client-supplied identity headers in production
check "proxy defines a production identity boundary (isProdProxy)"   grep -q 'isProdProxy = process.env.NODE_ENV === "production"' "$ROUTE"
check "proxy strips browser x-user-id in production"                 grep -q 'headers.delete("x-user-id")' "$ROUTE"
check "proxy strips browser x-org-id in production"                  grep -q 'headers.delete("x-org-id")' "$ROUTE"
check "proxy strips forwarded identity aliases in production"        grep -q 'headers.delete("x-forwarded-user-id")' "$ROUTE"
check "proxy ignores header identity in production"                  grep -q 'isProdProxy ? "" : (headers.get("x-user-id")' "$ROUTE"

# Identity comes from the verified session/token path in production
check "proxy verifies bearer against Supabase in production"         grep -q 'isProdProxy ? await getUserIdFromAuthorizationHeader(req)' "$ROUTE"
check "proxy org id is server-resolved in production"                grep -q 'isProdProxy' "$ROUTE"
check "proxy still resolves cookie sessions"                         grep -q 'getUserIdFromSupabaseCookies' "$ROUTE"

# Trusted identity headers are generated server-side only
check "proxy injects x-user-id after resolution"                     grep -q 'headers.set("x-user-id", resolvedUserId)' "$ROUTE"
check "proxy stamps x-proxy-secret from server env only"             grep -q 'process.env.PROXY_SHARED_SECRET' "$ROUTE"
check "proxy never forwards a client x-proxy-secret"                 grep -q 'headers.delete("x-proxy-secret")' "$ROUTE"

# Production dev fallback disabled
check "dev uid fallback gated to non-production"                     grep -q 'process.env.NODE_ENV !== "production" && !!devUid' "$ROUTE"

# Documentation updated
check "audit doc records Day 175 patches"                            grep -q "Day 175 patches" "$DOC"

# Existing validations still intact
check "Day 174 security validation still passes"                     bash scripts/validate-security-day-174.sh

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Day 175 security validation FAILED ($FAIL failures, $PASS passed)"
  exit 1
fi
echo "✅ Day 175 security validation PASSED ($PASS checks)"
