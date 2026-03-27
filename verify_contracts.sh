#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Running Tenworks contract checks..."

FAILED=0

check_no_match() {
  local pattern="$1"
  local label="$2"
  local glob="$3"
  if rg -n --glob "$glob" "$pattern" js >/dev/null 2>&1; then
    echo "FAIL: ${label}"
    rg -n --glob "$glob" "$pattern" js || true
    FAILED=1
  else
    echo "PASS: ${label}"
  fi
}

# Table contract checks
check_no_match "from\\('deals'\\)|from\\(\"deals\"\\)" "No legacy deals table usage (must use deals_tw)" "*.js"

# Route/query-key contract checks
check_no_match "contacts\\.html\\?id=" "No legacy contact deep-link key (?id)" "*.js"
check_no_match "accounts\\.html\\?id=" "No legacy account deep-link key (?id)" "*.js"
check_no_match "proposals\\.html\\?id=" "No legacy proposal deep-link key (?id)" "*.js"

# Reset redirect safety check
check_no_match "constellation-crm\\.com/reset-password\\.html" "No hardcoded Constellation reset domain in Tenworks auth flow" "*.js"

# Shared launch-flow dedupe checks
check_no_match "Launch Project Plan" "No duplicated launch modal markup in projects/schedule (must use shared helper)" "projects.js"
check_no_match "Launch Project Plan" "No duplicated launch modal markup in projects/schedule (must use shared helper)" "schedule.js"

# Staffing-hour contract checks
check_no_match "a\\.hours[^\\n]*:\\s*8" "No implicit 8-hour fallback in assignment hour calculations" "*.js"

if [[ "$FAILED" -ne 0 ]]; then
  echo "Contract checks failed."
  exit 1
fi

echo "All contract checks passed."
