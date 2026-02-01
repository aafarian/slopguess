# Slop Guesser -- Production Deployment Runbook

This runbook is the single source of truth for deploying and operating **slopguess.com**.
It covers everything from first-time server setup to day-to-day operations, rollbacks,
backups, TLS management, and troubleshooting.

> **Audience**: Anyone with SSH access to the production server. No prior knowledge of
> the codebase is assumed.

---

## Table of Contents

1. [First-Time Server Setup](#1-first-time-server-setup)
2. [First Deployment](#2-first-deployment)
3. [Routine Deployment (CI/CD)](#3-routine-deployment-cicd)
4. [Manual Deployment](#4-manual-deployment)
5. [Rollback Procedure](#5-rollback-procedure)
6. [Database Backup and Restore](#6-database-backup-and-restore)
7. [TLS Certificate Renewal](#7-tls-certificate-renewal)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. First-Time Server Setup

These steps prepare a fresh Ubuntu/Debian server to host Slop Guesser.

### 1.1 Install Docker and Docker Compose

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install required dependencies
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Docker Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow your user to run Docker without sudo
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 1.2 Clone the Repository

```bash
cd ~
git clone https://github.com/<your-org>/slop-guesser.git
cd ~/slop-guesser
```

> Replace `<your-org>` with the actual GitHub organization or username.

### 1.3 Configure Production Environment

```bash
# Copy the example environment file
cp .env.production.example .env.production

# Edit and fill in all required values
nano .env.production
```

At a minimum, set the following values in `.env.production`:

| Variable              | Description                                      | How to Generate                        |
|-----------------------|--------------------------------------------------|----------------------------------------|
| `POSTGRES_PASSWORD`   | Database password                                | `openssl rand -base64 32`              |
| `DATABASE_URL`        | Full connection string (must include above pass)  | See template in file                   |
| `JWT_SECRET`          | JWT signing key (>= 64 characters)               | `openssl rand -base64 64`              |
| `OPENAI_API_KEY`      | OpenAI API key for image generation              | From https://platform.openai.com       |
| `CORS_ORIGIN`         | Frontend URL (e.g., `https://slopguess.com`)     | Must match your domain exactly         |
| `DOMAIN`              | Your domain name (e.g., `slopguess.com`)         | --                                     |

### 1.4 Obtain Initial TLS Certificates

Before starting the full production stack, you need a TLS certificate from Let's Encrypt.

**Step 1**: Start only nginx temporarily to serve the ACME challenge:

```bash
# Start the client (nginx) container on port 80 for the ACME HTTP-01 challenge
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d client
```

**Step 2**: Run Certbot to obtain the initial certificate:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d slopguess.com -d www.slopguess.com \
  --email <your-email@example.com> \
  --agree-tos --no-eff-email
```

> Replace `<your-email@example.com>` with the email address for Let's Encrypt notifications
> (certificate expiry warnings, etc.).

**Step 3**: Verify the certificate was issued:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec client \
  ls /etc/letsencrypt/live/slopguess.com/
```

You should see `fullchain.pem`, `privkey.pem`, `cert.pem`, and `chain.pem`.

### 1.5 Start All Services

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Verify all containers are running:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

You should see four running containers:
- `slopguess-db` (PostgreSQL)
- `slopguess-server` (Node.js/Express API)
- `slopguess-client` (nginx serving the React frontend + reverse proxy)
- `slopguess-certbot` (auto-renewing TLS certificates)

---

## 2. First Deployment

After the server is set up and all containers are running, complete these one-time steps.

### 2.1 Run Database Migrations

Apply all pending database migrations:

```bash
./scripts/migrate-prod.sh up --no-backup
```

> The `--no-backup` flag is used here because there is no existing data to back up on
> a fresh database. For all subsequent migrations, omit this flag to create an automatic
> pre-migration backup.

Check migration status to confirm all migrations are applied:

```bash
./scripts/migrate-prod.sh status
```

### 2.2 Seed the Word Bank

If the application requires an initial word bank, seed it:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T server \
  npx tsx src/db/seed.ts
```

### 2.3 Run the Smoke Test

Verify the deployment is fully functional:

```bash
BASE_URL=https://slopguess.com ./scripts/smoke-test.sh
```

This runs 10 tests including TLS validation, DNS resolution, response time checks,
health endpoint verification, user registration, login, round fetching, guess submission,
leaderboard, and user history.

All 10 tests should pass (or show `SKIP` for tests that depend on an active game round).

---

## 3. Routine Deployment (CI/CD)

Routine deployments happen automatically when code is merged to the `main` branch.

### Pipeline Flow

1. **Push to `main`** -- A developer merges a pull request or pushes directly to `main`.
2. **CI Checks** (`ci` job) -- The GitHub Actions workflow runs linting, type checking, and tests.
3. **Build & Push** (`build-and-push` job) -- If CI passes, Docker images for the server and client are built and pushed to GitHub Container Registry (GHCR) with tags:
   - `latest` (default branch)
   - Git SHA (e.g., `abc1234`)
   - Branch name (`main`)
4. **Deploy** (`deploy` job) -- The workflow SSHs into the production server and:
   - Logs in to the container registry
   - Pulls the latest Docker images (`docker compose pull`)
   - Restarts services (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans`)
   - Checks migration status
5. **Health Check** -- The workflow verifies the API is responding by curling `/api/health` with retries (5 attempts, exponential backoff). If the health check fails, the deployment is marked as failed in GitHub Actions.

### Required GitHub Secrets

| Secret            | Description                                           |
|-------------------|-------------------------------------------------------|
| `GITHUB_TOKEN`    | Automatically provided by GitHub Actions (GHCR auth)  |
| `DEPLOY_SSH_KEY`  | Private SSH key for the production server              |
| `DEPLOY_HOST`     | Hostname or IP of the production server                |
| `DEPLOY_USER`     | SSH username on the production server                  |

### Monitoring a Deployment

Watch the deployment progress in the GitHub Actions tab of the repository. The deploy
workflow is named **Deploy** and shows each job (CI, Build & Push, Deploy) as a step.

---

## 4. Manual Deployment

Use manual deployment when you need to deploy outside the CI/CD pipeline (e.g., hotfix,
infrastructure change, or GitHub Actions is unavailable).

### 4.1 SSH into the Server

```bash
ssh <your-deploy-user>@<your-server-ip>
```

> Replace `<your-deploy-user>` and `<your-server-ip>` with the actual SSH credentials.

### 4.2 Pull and Restart

```bash
cd ~/slop-guesser

# Pull the latest Git changes
git pull origin main

# Pull the latest Docker images from the registry
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

# Restart services with the new images
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
```

### 4.3 Run Migrations (if needed)

```bash
# Check if there are pending migrations
./scripts/migrate-prod.sh status

# Apply pending migrations (creates an automatic backup first)
./scripts/migrate-prod.sh up

# Or preview pending migrations without applying
./scripts/migrate-prod.sh up --dry-run
```

### 4.4 Verify the Deployment

```bash
# Run the full smoke test suite
BASE_URL=https://slopguess.com ./scripts/smoke-test.sh

# Or do a quick health check
curl -s https://slopguess.com/api/health | jq .
```

Expected health check response:

```json
{ "status": "ok" }
```

---

## 5. Rollback Procedure

If a deployment introduces a bug or causes downtime, roll back to a known-good version.

### 5.1 Identify the Previous Image Tag

Image tags correspond to Git commit SHAs. Find the last known-good commit:

```bash
# On your local machine or the server, view recent commits
git log --oneline -10
```

Example output:

```
abc1234 Fix scoring algorithm
def5678 Add new word category
ghi9012 Update dependencies
```

If `abc1234` introduced the issue, roll back to `def5678`.

### 5.2 Rollback via GitHub Actions (Recommended)

1. Go to the repository's **Actions** tab on GitHub.
2. Select the **Deploy** workflow.
3. Click **Run workflow**.
4. Enter the Git SHA to roll back to in the `rollback_tag` field (e.g., `def5678`).
5. Click **Run workflow**.

The workflow will pull the specified image tag, retag it as `latest`, restart services,
and run a health check.

### 5.3 Rollback via SSH (Manual)

```bash
ssh <your-deploy-user>@<your-server-ip>
cd ~/slop-guesser

# Set the tag to roll back to
TAG="def5678"
REGISTRY="ghcr.io"
IMAGE_PREFIX="<your-org>/slop-guesser"

# Pull the specific tagged images
docker pull ${REGISTRY}/${IMAGE_PREFIX}/server:${TAG}
docker pull ${REGISTRY}/${IMAGE_PREFIX}/client:${TAG}

# Retag as latest so Docker Compose picks them up
docker tag ${REGISTRY}/${IMAGE_PREFIX}/server:${TAG} ${REGISTRY}/${IMAGE_PREFIX}/server:latest
docker tag ${REGISTRY}/${IMAGE_PREFIX}/client:${TAG} ${REGISTRY}/${IMAGE_PREFIX}/client:latest

# Restart services with the rolled-back images
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
```

> Replace `<your-org>` with the actual GitHub organization or username.

### 5.4 Verify Rollback

```bash
# Quick health check
curl -s https://slopguess.com/api/health | jq .

# Full smoke test
BASE_URL=https://slopguess.com ./scripts/smoke-test.sh
```

### 5.5 Rollback Database Migrations (if needed)

If the rolled-back version requires an older database schema:

```bash
# Roll back the most recent migration
./scripts/migrate-prod.sh down

# Check migration status to confirm
./scripts/migrate-prod.sh status
```

---

## 6. Database Backup and Restore

### 6.1 Manual Backup

Create an on-demand backup:

```bash
./scripts/db-backup.sh
```

The script will:
- Read `DATABASE_URL` from the environment or `.env.production`
- Create a timestamped SQL dump (e.g., `slopguess_20260201_143000.sql`)
- Compress it with gzip
- Store it in `./backups/` (configurable via `BACKUP_DIR`)
- Prune backups older than 30 days (configurable via `BACKUP_RETENTION_DAYS`)

Options:

```bash
# Show help
./scripts/db-backup.sh --help

# Custom backup directory
./scripts/db-backup.sh --backup-dir /mnt/backups

# Custom retention period
./scripts/db-backup.sh --retention 7

# Skip pruning old backups
./scripts/db-backup.sh --no-prune
```

### 6.2 Automated Backups (Cron)

Set up a daily backup at 2:00 AM:

```bash
# Open the crontab editor
crontab -e

# Add the following line
0 2 * * * /home/<your-deploy-user>/slop-guesser/scripts/db-backup.sh >> /var/log/slopguess-backup.log 2>&1
```

> Replace `<your-deploy-user>` with the actual SSH username.

### 6.3 Restore from Backup

**Step 1**: Identify the backup file to restore:

```bash
ls -lh ./backups/
```

**Step 2**: Decompress the backup:

```bash
gunzip ./backups/slopguess_20260201_143000.sql.gz
```

**Step 3**: Restore the database:

```bash
# If psql is available locally
PGPASSWORD=<your-db-password> psql \
  -h <your-db-host> \
  -p 5432 \
  -U <your-db-user> \
  -d slopguess \
  < ./backups/slopguess_20260201_143000.sql

# Or via Docker if psql is not available locally
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  psql -U slopguess -d slopguess \
  < ./backups/slopguess_20260201_143000.sql
```

> Replace `<your-db-password>`, `<your-db-host>`, and `<your-db-user>` with values
> from your `.env.production` file.

**Step 4**: Verify the restore:

```bash
./scripts/migrate-prod.sh status
```

---

## 7. TLS Certificate Renewal

### 7.1 Automatic Renewal

The `certbot` container in the production Docker Compose stack handles automatic renewal.
It runs `certbot renew` every 12 hours. Let's Encrypt certificates are valid for 90 days
and Certbot renews them when they have fewer than 30 days remaining.

No action is needed for routine renewals. The Certbot container must be running:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps certbot
```

### 7.2 Manual Renewal

If you need to force a certificate renewal:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
  renew --webroot -w /var/www/certbot --force-renewal
```

After renewal, reload nginx to pick up the new certificate:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec client \
  nginx -s reload
```

### 7.3 Check Certificate Expiry

Check when the current certificate expires:

```bash
echo | openssl s_client -servername slopguess.com -connect slopguess.com:443 2>/dev/null \
  | openssl x509 -noout -dates
```

Example output:

```
notBefore=Jan  1 00:00:00 2026 GMT
notAfter=Apr  1 00:00:00 2026 GMT
```

You can also use the smoke test to check certificate validity (it verifies TLS and warns
if the certificate expires within 7 days):

```bash
BASE_URL=https://slopguess.com ./scripts/smoke-test.sh
```

### 7.4 Certificate Troubleshooting

If Certbot fails to renew, check its logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs certbot --tail 50
```

Common issues:
- **Port 80 not reachable**: Ensure no firewall blocks HTTP traffic (needed for ACME challenge).
- **DNS not pointing to server**: Verify `dig slopguess.com` resolves to the server IP.
- **Rate limits**: Let's Encrypt has rate limits (50 certificates per domain per week). Wait or use the staging environment for testing (`--staging` flag).

---

## 8. Troubleshooting

### 8.1 Viewing Container Logs

```bash
# View logs for all services (last 100 lines, follow mode)
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 100 -f

# View logs for a specific service
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 100 -f server
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 100 -f client
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 100 -f postgres
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 100 -f certbot
```

### 8.2 Common Migration Failures

| Symptom                                   | Likely Cause                                    | Fix                                                 |
|-------------------------------------------|-------------------------------------------------|-----------------------------------------------------|
| `Server container is not running`         | The server container has exited or failed        | `docker compose ... up -d server` then retry        |
| `connection refused` during migration     | PostgreSQL is not ready or not running           | `docker compose ... up -d postgres` and wait        |
| `relation already exists`                 | Migration was partially applied                  | Check status with `./scripts/migrate-prod.sh status` and manually fix the migration state |
| `permission denied`                       | Database user lacks required privileges          | Check `POSTGRES_USER` in `.env.production`          |

Before running migrations, always check the current state:

```bash
./scripts/migrate-prod.sh status
```

### 8.3 Health Check Debugging

The health endpoint is `GET /api/health` and returns:
- `{ "status": "ok" }` with HTTP 200 when healthy
- `{ "status": "degraded" }` with HTTP 503 when the database is disconnected

**Quick health check**:

```bash
curl -s https://slopguess.com/api/health | jq .
```

**Use the uptime check script** for a more detailed check:

```bash
./scripts/uptime-check.sh
```

This checks both the API health endpoint and the frontend root. Exit code `0` means healthy,
`1` means unhealthy. Set `WEBHOOK_URL` to receive Slack/Discord alerts on failure:

```bash
WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx ./scripts/uptime-check.sh
```

Set up continuous monitoring with cron (checks every 5 minutes):

```bash
crontab -e

# Add the following line
*/5 * * * * /home/<your-deploy-user>/slop-guesser/scripts/uptime-check.sh >> /var/log/uptime-check.log 2>&1
```

> Replace `<your-deploy-user>` with the actual SSH username.

**If health returns `degraded`**:
1. Check if PostgreSQL is running: `docker compose ... ps postgres`
2. Check PostgreSQL logs: `docker compose ... logs --tail 50 postgres`
3. Check the server's connection: `docker compose ... logs --tail 50 server | grep -i database`
4. Restart PostgreSQL: `docker compose ... restart postgres`

**If health is unreachable**:
1. Check if the server container is running: `docker compose ... ps server`
2. Check if nginx is running: `docker compose ... ps client`
3. Check nginx error log: `docker compose ... logs --tail 50 client`
4. Check firewall rules: `sudo ufw status` (port 80 and 443 must be open)

### 8.4 Disk Space Issues

Docker images and container logs can consume significant disk space over time.

**Check disk usage**:

```bash
df -h /
docker system df
```

**Clean up unused Docker resources**:

```bash
# Remove stopped containers, unused networks, dangling images, and build cache
docker system prune -f

# Remove all unused images (not just dangling ones)
docker system prune -a -f

# Remove old backup files manually
ls -lh ~/slop-guesser/backups/
```

**Prevent log bloat**: The production Docker Compose configuration limits log file sizes to
10 MB with a maximum of 5 files per container (configured via `json-file` logging driver).

### 8.5 Restarting Individual Services

```bash
# Restart a specific service
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart server
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart client
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart postgres
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart certbot

# Stop and recreate a single service (pulls fresh config)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate server

# Restart all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
```

### 8.6 Full Stack Restart

If multiple services are misbehaving, do a full restart:

```bash
cd ~/slop-guesser

docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> Note: `down` stops and removes containers but preserves named volumes (database data,
> TLS certificates). Your data is safe.

---

## Script Reference

| Script                       | Purpose                                              | Usage                                                |
|------------------------------|------------------------------------------------------|------------------------------------------------------|
| `scripts/smoke-test.sh`     | End-to-end smoke tests (10 checks including TLS)     | `BASE_URL=https://slopguess.com ./scripts/smoke-test.sh` |
| `scripts/db-backup.sh`      | Create compressed PostgreSQL backups                  | `./scripts/db-backup.sh` or `./scripts/db-backup.sh --help` |
| `scripts/migrate-prod.sh`   | Run database migrations via Docker                    | `./scripts/migrate-prod.sh up` or `./scripts/migrate-prod.sh --help` |
| `scripts/uptime-check.sh`   | Lightweight health monitoring for cron                | `./scripts/uptime-check.sh` or `./scripts/uptime-check.sh --help` |
