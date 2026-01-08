#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost:3000}"

echo "== Proxy auth smoke =="

echo "1) Expect 401 when no auth is sent"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/proxy/v1/assignments")
if [ "$code" != "401" ]; then
  echo "FAIL: expected 401, got $code"
  exit 1
fi
echo "OK (401)"

echo "2) Expect 200 when x-user-id header is sent"
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-user-id: 00000000-0000-4000-8000-000000000001" \
  "$BASE/api/proxy/v1/assignments")
if [ "$code" != "200" ]; then
  echo "FAIL: expected 200, got $code"
  exit 1
fi
echo "OK (200)"

echo "3) Expect debug endpoint to show target/base"
curl -s "$BASE/api/proxy/v1/assignments?debug=1" | head -c 200; echo
echo "OK"

echo "✅ Proxy auth smoke passed"