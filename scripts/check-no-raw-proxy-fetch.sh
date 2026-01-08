#!/usr/bin/env bash
set -euo pipefail

hits=$(rg -n "fetch\((\s*)?[\"']?/api/proxy" src || true)

if [ -n "$hits" ]; then
  echo "FAIL: found raw fetch('/api/proxy...') calls. Use proxyFetch() instead."
  echo "$hits"
  exit 1
fi

echo "OK: no raw fetch('/api/proxy') usage"