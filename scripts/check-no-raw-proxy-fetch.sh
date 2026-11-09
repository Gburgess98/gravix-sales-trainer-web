#!/usr/bin/env bash
# Guard: browser code must reach /api/proxy through the authenticated helpers (proxyFetch / apiGet / apiPost / fetchJsonWithRetry),
# never a bare fetch(): the Supabase session lives in browser storage, so a bare fetch carries no Authorization and the hardened
# proxy answers 401. Detects, across lines:
#   A. fetch( "..." | '...' | `...` ) whose literal contains /api/proxy (including `${base}/api/proxy/...` and multi-line calls)
#   B. fetch( `${PROXY}...` ) / fetch( PROXY + ... ) style calls through a proxy-base constant
#   C. fetch( someIdentifier ) in a file that mentions /api/proxy (the URL was built elsewhere in the file)
# Usage: check-no-raw-proxy-fetch.sh [DIR]   (default: src; allowlist: scripts/raw-proxy-fetch-allowlist.txt, paths relative to repo root)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCAN="${1:-$ROOT/src}"
ALLOW="${RAW_PROXY_FETCH_ALLOWLIST:-$ROOT/scripts/raw-proxy-fetch-allowlist.txt}"

echo "🔍 Checking for bare fetch() calls to /api/proxy (quoted, template-literal, multi-line, via constants)..."

allowed() {
  local rel="${1#$ROOT/}"
  [ -f "$ALLOW" ] || return 1
  grep -vE '^\s*(#|$)' "$ALLOW" | grep -qxF "$rel"
}

NB='(?<![A-Za-z0-9_$.])'   # not part of a longer identifier / member call (proxyFetch(, this.fetch(, ...)
HITS=""

A=$(rg -nU --pcre2 "${NB}fetch\\(\\s*[\`\"'](?:[^\`\"'\\n]|\\$\\{[^}\\n]*\\})*?/api/proxy" "$SCAN" -g '*.ts' -g '*.tsx' -g '*.mts' -g '*.js' -g '*.jsx' 2>/dev/null || true)
B=$(rg -nU --pcre2 "${NB}fetch\\(\\s*(?:[\`\"']\\$\\{\\s*(?:PROXY|API_URL|PROXY_BASE|API_BASE)\\b|(?:PROXY|API_URL|PROXY_BASE)\\s*\\+)" "$SCAN" -g '*.ts' -g '*.tsx' -g '*.mts' -g '*.js' -g '*.jsx' 2>/dev/null || true)
C=""
for f in $(rg -l "/api/proxy" "$SCAN" -g '*.ts' -g '*.tsx' -g '*.mts' -g '*.js' -g '*.jsx' 2>/dev/null || true); do
  m=$(rg -nP "${NB}fetch\\(\\s*[A-Za-z_][A-Za-z0-9_.]*\\s*[,)]" "$f" 2>/dev/null || true)
  [ -n "$m" ] && C="$C"$'\n'"$(echo "$m" | sed "s#^#$f:#")"
done

ALL=$(printf '%s\n%s\n%s\n' "$A" "$B" "$C" | grep -v '^\s*$' | sort -u || true)
while IFS= read -r line; do
  [ -z "$line" ] && continue
  file="${line%%:*}"
  allowed "$file" && continue
  HITS="$HITS$line"$'\n'
done <<< "$ALL"

if [ -n "$HITS" ]; then
  echo "❌ ERROR: bare fetch() to /api/proxy detected (no Authorization on the hardened proxy → 401)."
  echo ""
  printf '%s' "$HITS"
  echo ""
  echo "👉 Use proxyFetch / apiGet / apiPost from src/lib/api.ts (or fetchJsonWithRetry), or add the file to scripts/raw-proxy-fetch-allowlist.txt with a reason."
  exit 1
fi

echo "✅ No raw proxy fetch usage found."
