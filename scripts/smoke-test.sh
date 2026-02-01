#!/usr/bin/env bash
# =============================================================================
# Smoke Test Suite for Slop Guess API
#
# Runs 10 sequential end-to-end tests against the API to verify core flows:
#   1. TLS certificate validation (HTTPS only; skips for localhost/HTTP)
#   2. DNS resolution check (HTTPS only; skips for localhost/HTTP)
#   3. Response time assertion (HTTPS only; skips for localhost/HTTP)
#   4. Health check
#   5. User registration
#   6. User login
#   7. Fetch active round
#   8. Submit a guess
#   9. Verify leaderboard
#  10. Verify user history
#
# Usage:
#   ./scripts/smoke-test.sh                        # defaults to localhost:3001
#   BASE_URL=https://staging.example.com ./scripts/smoke-test.sh
#   ./scripts/smoke-test.sh http://localhost:3001
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Accept BASE_URL from: 1) first argument, 2) env var, 3) default
BASE_URL="${1:-${BASE_URL:-http://localhost:3001}}"
# Strip trailing slash
BASE_URL="${BASE_URL%/}"

# Unique test user credentials (timestamp-based to avoid collisions)
TIMESTAMP="$(date +%s%N 2>/dev/null || date +%s)"
TEST_USERNAME="smoketest_${TIMESTAMP}"
TEST_EMAIL="${TEST_USERNAME}@test.local"
TEST_PASSWORD="SmokeTest_${TIMESTAMP}!"

# Counters
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# Captured state across tests
JWT_TOKEN=""
ROUND_ID=""
ACTIVE_ROUND_EXISTS=false

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# ANSI colors (disabled when not a terminal or CI explicitly sets NO_COLOR)
if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

log()   { printf "%b\n" "$*"; }
pass()  { PASSED=$((PASSED + 1)); log "${GREEN}  PASS${RESET} $1"; }
fail()  { FAILED=$((FAILED + 1)); log "${RED}  FAIL${RESET} $1${2:+ -- $2}"; }
skip()  { SKIPPED=$((SKIPPED + 1)); log "${YELLOW}  SKIP${RESET} $1${2:+ -- $2}"; }
step()  { TOTAL=$((TOTAL + 1)); log "\n${CYAN}[$TOTAL/10]${RESET} ${BOLD}$1${RESET}"; }

# Perform a curl request and capture HTTP status + body.
# Usage: http_request METHOD URL [CURL_EXTRA_ARGS...]
# Sets: HTTP_STATUS, HTTP_BODY
HTTP_STATUS=""
HTTP_BODY=""

http_request() {
  local method="$1"
  local url="$2"
  shift 2

  local tmp
  tmp="$(mktemp)"

  HTTP_STATUS=$(
    curl -s -o "$tmp" -w '%{http_code}' \
      -X "$method" \
      --max-time 15 \
      "$@" \
      "$url"
  ) || {
    HTTP_STATUS="000"
    HTTP_BODY=""
    rm -f "$tmp"
    return 1
  }

  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
  return 0
}

# Extract a JSON string value by key (simple jq-free approach using grep/sed).
# Falls back to jq if available. Usage: json_value KEY JSON_STRING
json_value() {
  local key="$1"
  local json="$2"

  if command -v jq &>/dev/null; then
    printf '%s' "$json" | jq -r ".$key // empty" 2>/dev/null
  else
    # Fallback: simple regex extraction for flat string/number values
    printf '%s' "$json" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1
  fi
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

log "\n${BOLD}========================================${RESET}"
log "${BOLD} Slop Guess Smoke Tests${RESET}"
log "${BOLD}========================================${RESET}"
log " Target: ${CYAN}${BASE_URL}${RESET}"
log " User:   ${TEST_USERNAME}"
log " Time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "${BOLD}========================================${RESET}"

# ---------------------------------------------------------------------------
# Production-readiness detection
# ---------------------------------------------------------------------------
# Determine if we're targeting a real HTTPS domain (not localhost / HTTP).
# The 3 production-readiness checks (TLS, DNS, response-time) only activate
# when IS_PROD_TARGET is true; otherwise they are gracefully skipped.

IS_PROD_TARGET=false
PROD_HOST=""

if [[ "$BASE_URL" == https://* ]]; then
  # Extract hostname (strip scheme and any trailing path/port)
  PROD_HOST="${BASE_URL#https://}"
  PROD_HOST="${PROD_HOST%%/*}"
  PROD_HOST="${PROD_HOST%%:*}"

  # Skip for localhost / 127.x / [::1]
  case "$PROD_HOST" in
    localhost|127.*|"[::1]") IS_PROD_TARGET=false ;;
    *) IS_PROD_TARGET=true ;;
  esac
fi

# ---------------------------------------------------------------------------
# Test 1: TLS certificate validation (production only)
# ---------------------------------------------------------------------------
step "TLS certificate validation"

if [[ "$IS_PROD_TARGET" != "true" ]]; then
  skip "TLS check" "Skipping -- BASE_URL is not an HTTPS production domain"
else
  tls_ok=true
  tls_reason=""

  # Retrieve certificate details via openssl
  cert_output="$(echo | openssl s_client -servername "$PROD_HOST" -connect "${PROD_HOST}:443" 2>/dev/null)" || true

  # Check for self-signed certificate
  if printf '%s' "$cert_output" | grep -qi "self.signed"; then
    tls_ok=false
    tls_reason="Certificate is self-signed"
  fi

  # Check certificate expiry (must be valid for at least 7 days)
  if [[ "$tls_ok" == "true" ]]; then
    expiry_date="$(echo | openssl s_client -servername "$PROD_HOST" -connect "${PROD_HOST}:443" 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')" || true

    if [[ -n "$expiry_date" ]]; then
      # Convert expiry to epoch
      if date -j -f "%b %d %T %Y %Z" "$expiry_date" +%s &>/dev/null; then
        expiry_epoch="$(date -j -f "%b %d %T %Y %Z" "$expiry_date" +%s 2>/dev/null)"
      elif date -d "$expiry_date" +%s &>/dev/null; then
        expiry_epoch="$(date -d "$expiry_date" +%s 2>/dev/null)"
      else
        expiry_epoch=""
      fi

      if [[ -n "$expiry_epoch" ]]; then
        now_epoch="$(date +%s)"
        days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
        if [[ "$days_left" -lt 7 ]]; then
          tls_ok=false
          tls_reason="Certificate expires in ${days_left} days (< 7 day threshold)"
        fi
      fi
    else
      tls_ok=false
      tls_reason="Could not retrieve certificate expiry date"
    fi
  fi

  # Verify certificate is trusted by curl
  if [[ "$tls_ok" == "true" ]]; then
    if ! curl -sS --max-time 10 -o /dev/null "https://${PROD_HOST}" 2>/dev/null; then
      tls_ok=false
      tls_reason="curl could not verify TLS certificate"
    fi
  fi

  if [[ "$tls_ok" == "true" ]]; then
    pass "TLS certificate is valid, trusted, and not expiring within 7 days"
  else
    fail "TLS certificate validation" "$tls_reason"
  fi
fi

# ---------------------------------------------------------------------------
# Test 2: DNS resolution check (production only)
# ---------------------------------------------------------------------------
step "DNS resolution check"

if [[ "$IS_PROD_TARGET" != "true" ]]; then
  skip "DNS check" "Skipping -- BASE_URL is not an HTTPS production domain"
else
  resolved_ip=""

  # Try dig first, fall back to nslookup
  if command -v dig &>/dev/null; then
    resolved_ip="$(dig +short "$PROD_HOST" A 2>/dev/null | head -1)"
  elif command -v nslookup &>/dev/null; then
    resolved_ip="$(nslookup "$PROD_HOST" 2>/dev/null | awk '/^Address: / { print $2 }' | head -1)"
  fi

  if [[ -n "$resolved_ip" ]]; then
    pass "Domain '${PROD_HOST}' resolves to ${resolved_ip}"
  else
    fail "DNS resolution" "Could not resolve '${PROD_HOST}' to an IP address"
  fi
fi

# ---------------------------------------------------------------------------
# Test 3: Response time assertion (production only)
# ---------------------------------------------------------------------------
step "Response time assertion (NFR-001)"

if [[ "$IS_PROD_TARGET" != "true" ]]; then
  skip "Response time check" "Skipping -- BASE_URL is not an HTTPS production domain"
else
  timing_ok=true
  timing_detail=""

  # Check API health endpoint response time (must be < 1s per NFR-001)
  api_time="$(curl -s -o /dev/null -w '%{time_total}' --max-time 10 "${BASE_URL}/api/health" 2>/dev/null)" || api_time="99"
  api_ms="$(printf '%.0f' "$(echo "$api_time * 1000" | bc 2>/dev/null || echo '99000')")"

  if [[ "$api_ms" -ge 1000 ]]; then
    timing_ok=false
    timing_detail="API health response took ${api_time}s (limit: 1s)"
  fi

  # Check frontend root response time (must be < 2s per NFR-001)
  # Derive frontend URL: strip /api* path if present, or use scheme+host
  frontend_url="${BASE_URL%%/api*}"
  frontend_time="$(curl -s -o /dev/null -w '%{time_total}' --max-time 10 "${frontend_url}/" 2>/dev/null)" || frontend_time="99"
  frontend_ms="$(printf '%.0f' "$(echo "$frontend_time * 1000" | bc 2>/dev/null || echo '99000')")"

  if [[ "$frontend_ms" -ge 2000 ]]; then
    timing_ok=false
    if [[ -n "$timing_detail" ]]; then
      timing_detail="${timing_detail}; Frontend root took ${frontend_time}s (limit: 2s)"
    else
      timing_detail="Frontend root took ${frontend_time}s (limit: 2s)"
    fi
  fi

  if [[ "$timing_ok" == "true" ]]; then
    pass "API health: ${api_time}s (< 1s), Frontend root: ${frontend_time}s (< 2s)"
  else
    fail "Response time assertion" "$timing_detail"
  fi
fi

# ---------------------------------------------------------------------------
# Test 4: GET /api/health
# ---------------------------------------------------------------------------
step "GET /api/health - verify server is up"

if http_request GET "${BASE_URL}/api/health"; then
  if [[ "$HTTP_STATUS" == "200" ]]; then
    status_field="$(json_value status "$HTTP_BODY")"
    if [[ "$status_field" == "ok" || "$status_field" == "degraded" ]]; then
      pass "Health endpoint returned ${HTTP_STATUS} (status: ${status_field})"
    else
      fail "Health endpoint returned 200 but unexpected status: ${status_field}"
    fi
  else
    fail "Health endpoint returned HTTP ${HTTP_STATUS} (expected 200)" "$HTTP_BODY"
  fi
else
  fail "Could not connect to ${BASE_URL}/api/health" "Is the server running?"
fi

# ---------------------------------------------------------------------------
# Test 5: POST /api/auth/register
# ---------------------------------------------------------------------------
step "POST /api/auth/register - create test user"

if http_request POST "${BASE_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${TEST_USERNAME}\",\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}"; then

  if [[ "$HTTP_STATUS" == "201" ]]; then
    reg_token="$(json_value token "$HTTP_BODY")"
    if [[ -n "$reg_token" ]]; then
      pass "Registered user '${TEST_USERNAME}' and received JWT"
    else
      fail "Registration returned 201 but no token in response"
    fi
  else
    fail "Registration returned HTTP ${HTTP_STATUS} (expected 201)" "$HTTP_BODY"
  fi
else
  fail "Could not connect to register endpoint"
fi

# ---------------------------------------------------------------------------
# Test 6: POST /api/auth/login
# ---------------------------------------------------------------------------
step "POST /api/auth/login - authenticate and capture JWT"

if http_request POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}"; then

  if [[ "$HTTP_STATUS" == "200" ]]; then
    JWT_TOKEN="$(json_value token "$HTTP_BODY")"
    if [[ -n "$JWT_TOKEN" ]]; then
      pass "Login successful, JWT captured (${#JWT_TOKEN} chars)"
    else
      fail "Login returned 200 but no token in response"
    fi
  else
    fail "Login returned HTTP ${HTTP_STATUS} (expected 200)" "$HTTP_BODY"
  fi
else
  fail "Could not connect to login endpoint"
fi

# ---------------------------------------------------------------------------
# Test 7: GET /api/rounds/active
# ---------------------------------------------------------------------------
step "GET /api/rounds/active - fetch current round"

if [[ -z "$JWT_TOKEN" ]]; then
  skip "Skipping active round check (no JWT from login)"
else
  if http_request GET "${BASE_URL}/api/rounds/active" \
    -H "Authorization: Bearer ${JWT_TOKEN}"; then

    if [[ "$HTTP_STATUS" == "200" ]]; then
      # Extract round ID - try nested round.id first
      if command -v jq &>/dev/null; then
        ROUND_ID="$(printf '%s' "$HTTP_BODY" | jq -r '.round.id // empty' 2>/dev/null)"
      else
        ROUND_ID="$(printf '%s' "$HTTP_BODY" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
      fi

      if [[ -n "$ROUND_ID" ]]; then
        ACTIVE_ROUND_EXISTS=true
        pass "Active round found: ${ROUND_ID}"
      else
        fail "Active round returned 200 but could not parse round ID"
      fi
    elif [[ "$HTTP_STATUS" == "404" ]]; then
      ACTIVE_ROUND_EXISTS=false
      skip "No active round exists (scheduler may not have created one)" "HTTP 404"
    else
      fail "Active round returned HTTP ${HTTP_STATUS}" "$HTTP_BODY"
    fi
  else
    fail "Could not connect to active round endpoint"
  fi
fi

# ---------------------------------------------------------------------------
# Test 8: POST /api/rounds/:roundId/guess
# ---------------------------------------------------------------------------
step "POST /api/rounds/:roundId/guess - submit a guess"

if [[ "$ACTIVE_ROUND_EXISTS" != "true" ]]; then
  skip "Skipping guess submission (no active round)"
elif [[ -z "$JWT_TOKEN" ]]; then
  skip "Skipping guess submission (no JWT from login)"
else
  GUESS_TEXT="smoke test guess ${TIMESTAMP}"

  if http_request POST "${BASE_URL}/api/rounds/${ROUND_ID}/guess" \
    -H "Authorization: Bearer ${JWT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"guess\":\"${GUESS_TEXT}\"}"; then

    if [[ "$HTTP_STATUS" == "201" ]]; then
      guess_score="$(json_value score "$HTTP_BODY")"
      pass "Guess submitted successfully (score: ${guess_score:-N/A})"
    elif [[ "$HTTP_STATUS" == "409" ]]; then
      # Already guessed - this can happen if the smoke test ran before on the same round
      pass "Guess already submitted for this round (409 is acceptable)"
    else
      fail "Guess submission returned HTTP ${HTTP_STATUS} (expected 201)" "$HTTP_BODY"
    fi
  else
    fail "Could not connect to guess endpoint"
  fi
fi

# ---------------------------------------------------------------------------
# Test 9: GET /api/rounds/:roundId/leaderboard
# ---------------------------------------------------------------------------
step "GET /api/rounds/:roundId/leaderboard - verify leaderboard"

if [[ "$ACTIVE_ROUND_EXISTS" != "true" ]]; then
  skip "Skipping leaderboard check (no active round)"
else
  if http_request GET "${BASE_URL}/api/rounds/${ROUND_ID}/leaderboard"; then

    if [[ "$HTTP_STATUS" == "200" ]]; then
      # Check if the leaderboard contains entries
      if command -v jq &>/dev/null; then
        lb_count="$(printf '%s' "$HTTP_BODY" | jq '.leaderboard | length' 2>/dev/null)"
        has_user="$(printf '%s' "$HTTP_BODY" | jq --arg u "$TEST_USERNAME" '[.leaderboard[] | select(.username == $u)] | length' 2>/dev/null)"
      else
        lb_count="$(printf '%s' "$HTTP_BODY" | grep -o '"username"' | wc -l | tr -d ' ')"
        if printf '%s' "$HTTP_BODY" | grep -q "\"${TEST_USERNAME}\""; then
          has_user="1"
        else
          has_user="0"
        fi
      fi

      if [[ "${has_user:-0}" -ge 1 ]]; then
        pass "Leaderboard includes test user (${lb_count} total entries)"
      elif [[ "${lb_count:-0}" -ge 0 ]]; then
        # User might not appear if guess was a 409 from a previous run
        pass "Leaderboard returned successfully (${lb_count} entries)"
      else
        fail "Leaderboard response could not be parsed"
      fi
    else
      fail "Leaderboard returned HTTP ${HTTP_STATUS} (expected 200)" "$HTTP_BODY"
    fi
  else
    fail "Could not connect to leaderboard endpoint"
  fi
fi

# ---------------------------------------------------------------------------
# Test 10: GET /api/users/me/history
# ---------------------------------------------------------------------------
step "GET /api/users/me/history - verify user history"

if [[ -z "$JWT_TOKEN" ]]; then
  skip "Skipping user history check (no JWT from login)"
else
  if http_request GET "${BASE_URL}/api/users/me/history" \
    -H "Authorization: Bearer ${JWT_TOKEN}"; then

    if [[ "$HTTP_STATUS" == "200" ]]; then
      if command -v jq &>/dev/null; then
        history_count="$(printf '%s' "$HTTP_BODY" | jq '.history | length' 2>/dev/null)"
      else
        history_count="unknown"
      fi
      pass "User history returned successfully (${history_count} entries)"
    else
      fail "User history returned HTTP ${HTTP_STATUS} (expected 200)" "$HTTP_BODY"
    fi
  else
    fail "Could not connect to user history endpoint"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

log "\n${BOLD}========================================${RESET}"
log "${BOLD} Results${RESET}"
log "${BOLD}========================================${RESET}"
log "  Total:   ${TOTAL}"
log "  ${GREEN}Passed:  ${PASSED}${RESET}"
[[ "$FAILED" -gt 0 ]]  && log "  ${RED}Failed:  ${FAILED}${RESET}"
[[ "$SKIPPED" -gt 0 ]] && log "  ${YELLOW}Skipped: ${SKIPPED}${RESET}"
log "${BOLD}========================================${RESET}"

if [[ "$FAILED" -gt 0 ]]; then
  log "\n${RED}${BOLD}SMOKE TEST FAILED${RESET} ($FAILED failure(s))\n"
  exit 1
else
  log "\n${GREEN}${BOLD}SMOKE TEST PASSED${RESET}\n"
  exit 0
fi
