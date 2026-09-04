#!/usr/bin/env bash
#
# Combined clean-checkout release suite.
#
# Runs each repository's own canonical `check:release` gate (WEB then API),
# fail-fast, and returns non-zero on the first failure. This orchestrator does
# NOT re-implement any lint/type/build logic — it only sequences the two
# repos' release scripts, so the individual gates remain the single source of
# truth.
#
# Scope: static engineering release proof only. It runs NO live database,
# staging, production, end-to-end or paid-AI checks.
#
# API repo location: set GRAVIX_API_REPO to override; otherwise it defaults to
# the known sibling checkout next to this WEB repo.

set -uo pipefail

# --- Resolve WEB repo root from this script's own location (scripts/ -> root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Resolve API repo: explicit override, else the sibling checkout.
DEFAULT_API_REPO="$(cd "$WEB_REPO/.." && pwd)/gravix-sales-trainer-api"
API_REPO="${GRAVIX_API_REPO:-$DEFAULT_API_REPO}"

fail() {
  printf '\n[RED] %s\n' "$1" >&2
  exit 1
}

# Validate a repo directory exists and exposes a `check:release` script.
validate_repo() {
  local label="$1" dir="$2"
  [ -d "$dir" ] || fail "${label} repo directory not found: ${dir}"
  [ -f "$dir/package.json" ] || fail "${label} package.json not found in: ${dir}"
  local script
  script="$(cd "$dir" && node -p "require('./package.json').scripts && require('./package.json').scripts['check:release'] || ''" 2>/dev/null)" \
    || fail "${label} package.json could not be read: ${dir}"
  [ -n "$script" ] || fail "${label} has no \"check:release\" script: ${dir}"
}

# Run one repo's canonical check:release, capturing output for a concise summary.
run_gate() {
  local label="$1" dir="$2"
  local out
  out="$(mktemp)"
  printf '\n[RUN] %s check:release  (%s)\n' "$label" "$dir"
  if (cd "$dir" && npm run check:release) >"$out" 2>&1; then
    printf '[GREEN] %s check:release\n' "$label"
    rm -f "$out"
  else
    printf '[RED] %s check:release failed — last 40 lines:\n' "$label"
    tail -n 40 "$out"
    rm -f "$out"
    exit 1
  fi
}

printf 'Gravix combined release suite (static engineering gates only)\n'
printf 'WEB: %s\n' "$WEB_REPO"
printf 'API: %s\n' "$API_REPO"

validate_repo "WEB" "$WEB_REPO"
validate_repo "API" "$API_REPO"

run_gate "WEB" "$WEB_REPO"
run_gate "API" "$API_REPO"

printf '\n[GREEN] Combined release suite passed — WEB + API check:release both green\n'
