# Monitoring

This document covers health checking, uptime monitoring, and alerting for Slop Guesser in production.

## Health Endpoint

**URL**: `GET /api/health`

The API exposes a health endpoint that reports the overall system status.

### Response Contract

| HTTP Status | `status` field | Meaning |
|-------------|---------------|---------|
| 200 | `"ok"` | All systems operational -- database connected, scheduler running |
| 503 | `"degraded"` | Service is up but degraded -- database disconnected |

### Response Shape

```json
{
  "status": "ok",
  "timestamp": "2026-01-15T12:00:00.000Z",
  "uptime": 86400,
  "db": {
    "connected": true
  },
  "scheduler": {
    "running": true,
    "nextRotation": "2026-01-16T00:00:00.000Z"
  },
  "memory": {
    "rss": 85.2,
    "heapUsed": 42.1,
    "heapTotal": 65.0,
    "external": 1.8
  },
  "services": {
    "database": "connected"
  }
}
```

When the database is disconnected, the endpoint returns HTTP 503 with `"status": "degraded"` and `"services.database": "disconnected"`.

## What to Monitor

| Check | URL / Target | Expected | Frequency |
|-------|-------------|----------|-----------|
| API health | `GET /api/health` | HTTP 200, `status: "ok"` | Every 5 min |
| Frontend | `GET /` | HTTP 200 | Every 5 min |
| TLS certificate expiry | `https://slopguess.com` | Valid, > 14 days to expiry | Daily |
| Database connectivity | Included in `/api/health` `db.connected` field | `true` | Every 5 min |

## Alerting Thresholds

- **Check interval**: Every 5 minutes
- **Alert after**: 2 consecutive failures (avoids flapping on transient network issues)
- **Recovery notification**: Send an "up" alert when service recovers after a downtime event
- **TLS expiry warning**: Alert when certificate expires in fewer than 14 days

## Recommended External Monitoring Services

For reliable uptime monitoring, use at least one external SaaS service. These check your site from multiple geographic locations and provide their own alerting infrastructure.

### UptimeRobot (Free Tier)

- **URL**: https://uptimerobot.com
- **Free plan**: 50 monitors, 5-minute check interval
- **Setup**: Add two HTTP monitors -- one for `https://slopguess.com/api/health` (keyword: `"ok"`), one for `https://slopguess.com/` (HTTP 200)
- **Alerts**: Email, Slack, Discord, webhook

### Better Uptime

- **URL**: https://betteruptime.com
- **Free plan**: 10 monitors, 3-minute check interval
- **Setup**: Add monitors for the health endpoint and frontend root
- **Extras**: Status page, incident management, on-call scheduling

### Healthchecks.io

- **URL**: https://healthchecks.io
- **Free plan**: 20 checks
- **Best for**: Cron job monitoring (expects periodic pings rather than polling)
- **Setup**: Create a check, then have the cron-based uptime script ping the Healthchecks.io URL on success. If the ping stops arriving, Healthchecks.io sends an alert
- **Alerts**: Email, Slack, Discord, PagerDuty, and others

## Self-Hosted Uptime Script

The repository includes a lightweight uptime check script at `scripts/uptime-check.sh`.

### What It Checks

1. `GET /api/health` -- verifies HTTP 200 and `status: "ok"` in the JSON response
2. `GET /` -- verifies the frontend returns HTTP 200

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `CHECK_URL` | `https://slopguess.com` | Base URL to monitor |
| `WEBHOOK_URL` | *(unset)* | Slack/Discord webhook URL for failure alerts |
| `TIMEOUT` | `10` | curl timeout in seconds |

### Usage

```bash
# Run manually
./scripts/uptime-check.sh

# Against a different environment
CHECK_URL=http://localhost:3001 ./scripts/uptime-check.sh

# With Slack alerting
WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx ./scripts/uptime-check.sh

# View help
./scripts/uptime-check.sh --help
```

### Cron Setup

To run the uptime check every 5 minutes and log output:

```bash
# Edit crontab
crontab -e

# Add this line (adjust paths as needed):
*/5 * * * * CHECK_URL=https://slopguess.com WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx /path/to/scripts/uptime-check.sh >> /var/log/slop-uptime.log 2>&1
```

For alert-after-2-failures behavior with cron, combine with Healthchecks.io: have the script ping Healthchecks.io on success, and configure Healthchecks.io with a 10-minute grace period (2 missed pings at 5-minute intervals = alert).

## Integration with Deploy Workflow

The deploy process should run a health check after each deployment to verify the new version is serving correctly. The smoke test suite (`scripts/smoke-test.sh`) already checks `/api/health` as its first test.

Post-deploy verification flow:

1. Deploy completes
2. Run `scripts/smoke-test.sh` against the production URL
3. If smoke tests fail, trigger a rollback
4. External monitors (UptimeRobot / Better Uptime) continue periodic checks independently

The uptime check script can also serve as a quick post-deploy gate:

```bash
CHECK_URL=https://slopguess.com ./scripts/uptime-check.sh || echo "Deploy health check failed!"
```
