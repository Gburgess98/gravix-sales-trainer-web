#!/usr/bin/env bash
set -e

echo "🔍 Checking for raw fetch('/api/proxy') usage..."

MATCHES=$(rg "fetch\\((\\s*)?[\"']?/api/proxy" src || true)

if [ -n "$MATCHES" ]; then
  echo "❌ ERROR: Raw fetch('/api/proxy') detected."
  echo ""
  echo "$MATCHES"
  echo ""
  echo "👉 Use proxyFetch / apiGet / apiPost from src/lib/api.ts instead."
  exit 1
fi

echo "✅ No raw proxy fetch usage found."