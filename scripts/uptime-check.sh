#!/usr/bin/env bash
# =============================================================================
# Uptime Check for Slop Guesser
#
# Lightweight health monitor that checks the API health endpoint and frontend
# root. Designed for cron execution -- no interactive prompts, logs to stdout,
# optionally sends webhook alerts on failure.
#
# Environment variables:
#   CHECK_URL    - Base URL to check (default: https://slopguess.com)
#   WEBHOOK_URL  - Slack/Discord webhook URL for failure alerts (optional)
#   TIMEOUT      - curl timeout in seconds (default: 10)
#
# Exit codes:
#   0 - All checks passed (healthy)
#   1 - One or more checks failed (unhealthy)
#
# Usage:
#   ./scripts/uptime-check.sh                          # default URL
#   CHECK_URL=http://localhost:3001 ./scripts/uptime-check.sh
#   ./scripts/uptime-check.sh --help
#
# Cron example (every 5 minutes):
#   */5 * * * * /path/to/scripts/uptime-check.sh >> /var/log/uptime-check.log 2>&1
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CHECK_URL="${CHECK_URL:-https://slopguess.com}"
CHECK_URL="${CHECK_URL%/}"  # strip trailing slash
WEBHOOK_URL="${WEBHOOK_URL:-}"
TIMEOUT="${TIMEOUT:-10}"

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HEALTHY=true
FAILURES=""

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'USAGE'
Usage: uptime-check.sh [--help]

Checks the Slop Guesser API health endpoint (/api/health) and frontend root
(/) to verify the service is up and healthy. Returns exit code 0 when all
checks pass, exit code 1 when any check fails.

Environment variables:
  CHECK_URL    Base URL to check (default: https://slopguess.com)
  WEBHOOK_URL  Slack/Discord-compatible webhook URL for failure alerts
  TIMEOUT      curl timeout in seconds (default: 10)

Checks performed:
  1. GET /api/health  -- expects HTTP 200 and JSON { "status": "ok" }
  2. GET /            -- expects HTTP 200 (frontend is serving)

When WEBHOOK_URL is set and a check fails, a POST is sent to the webhook
with a JSON payload describing the failure. Compatible with Slack incoming
webhooks and Discord webhook URLs (append /slack to Discord URL).

Designed for cron -- no interactive prompts, all output goes to stdout.

Examples:
  ./scripts/uptime-check.sh
  CHECK_URL=http://localhost:3001 ./scripts/uptime-check.sh
  WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx ./scripts/uptime-check.sh
USAGE
  exit 0
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  printf "[%s] %s\n" "$TIMESTAMP" "$*"
}

record_failure() {
  HEALTHY=false
  FAILURES="${FAILURES}${FAILURES:+\n}$1"
  log "FAIL: $1"
}

# ---------------------------------------------------------------------------
# Check 1: API Health Endpoint
# ---------------------------------------------------------------------------

log "Checking API health: ${CHECK_URL}/api/health"

HTTP_STATUS=""
HTTP_BODY=""

if HTTP_STATUS=$(curl -s -o /tmp/uptime-health-body.txt -w '%{http_code}' \
  --max-time "$TIMEOUT" \
  "${CHECK_URL}/api/health" 2>/dev/null); then

  HTTP_BODY="$(cat /tmp/uptime-health-body.txt 2>/dev/null || true)"
  rm -f /tmp/uptime-health-body.txt

  if [[ "$HTTP_STATUS" != "200" ]]; then
    record_failure "Health endpoint returned HTTP ${HTTP_STATUS} (expected 200)"
  else
    # Parse the status field from JSON response
    STATUS_FIELD=""
    if command -v jq &>/dev/null; then
      STATUS_FIELD="$(printf '%s' "$HTTP_BODY" | jq -r '.status // empty' 2>/dev/null)"
    else
      STATUS_FIELD="$(printf '%s' "$HTTP_BODY" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    fi

    if [[ "$STATUS_FIELD" == "ok" ]]; then
      log "OK: Health endpoint returned status=ok"
    elif [[ "$STATUS_FIELD" == "degraded" ]]; then
      record_failure "Health endpoint reports degraded status (database may be disconnected)"
    else
      record_failure "Health endpoint returned unexpected status: '${STATUS_FIELD}'"
    fi
  fi
else
  rm -f /tmp/uptime-health-body.txt
  record_failure "Could not connect to ${CHECK_URL}/api/health (timeout or connection refused)"
fi

# ---------------------------------------------------------------------------
# Check 2: Frontend Root
# ---------------------------------------------------------------------------

log "Checking frontend: ${CHECK_URL}/"

FRONTEND_STATUS=""

if FRONTEND_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  --max-time "$TIMEOUT" \
  "${CHECK_URL}/" 2>/dev/null); then

  if [[ "$FRONTEND_STATUS" == "200" ]]; then
    log "OK: Frontend returned HTTP 200"
  else
    record_failure "Frontend returned HTTP ${FRONTEND_STATUS} (expected 200)"
  fi
else
  record_failure "Could not connect to ${CHECK_URL}/ (timeout or connection refused)"
fi

# ---------------------------------------------------------------------------
# Webhook Alert (on failure only)
# ---------------------------------------------------------------------------

if [[ "$HEALTHY" == "false" && -n "$WEBHOOK_URL" ]]; then
  log "Sending webhook alert to ${WEBHOOK_URL%%\?*}"

  ALERT_TEXT="Slop Guesser is DOWN (${CHECK_URL})\nTime: ${TIMESTAMP}\nFailures:\n${FAILURES}"

  # Slack/Discord compatible payload
  PAYLOAD=$(printf '{"text":"%s"}' "$(printf '%s' "$ALERT_TEXT" | sed 's/"/\\"/g')")

  if curl -s -o /dev/null -w '' \
    --max-time "$TIMEOUT" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$WEBHOOK_URL" 2>/dev/null; then
    log "Webhook alert sent successfully"
  else
    log "WARNING: Failed to send webhook alert"
  fi
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

if [[ "$HEALTHY" == "true" ]]; then
  log "RESULT: All checks passed -- service is healthy"
  exit 0
else
  log "RESULT: Service is UNHEALTHY"
  exit 1
fi
