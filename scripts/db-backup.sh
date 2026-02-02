#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SlopGuesser - Production Database Backup Script
# =============================================================================
# Creates timestamped, compressed PostgreSQL backups.
#
# Usage:
#   ./scripts/db-backup.sh [OPTIONS]
#
# Environment Variables:
#   DATABASE_URL            PostgreSQL connection string
#                           (e.g., postgresql://user:pass@host:5432/slopguess)
#   BACKUP_DIR              Directory to store backups (default: ./backups/)
#   BACKUP_RETENTION_DAYS   Remove backups older than N days (default: 30)
#
# The script reads DATABASE_URL from the environment or falls back to
# .env.production in the project root. It detects whether pg_dump is
# available locally and falls back to docker compose exec if not.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  log "ERROR: $*" >&2
}

die() {
  error "$@"
  exit 1
}

usage() {
  cat <<'HELP'
Usage: db-backup.sh [OPTIONS]

Create a compressed PostgreSQL database backup.

Options:
  --help                Show this help message and exit
  --backup-dir DIR      Override BACKUP_DIR (default: ./backups/)
  --retention DAYS      Override BACKUP_RETENTION_DAYS (default: 30)
  --no-prune            Skip pruning old backups

Environment Variables:
  DATABASE_URL            PostgreSQL connection string
  BACKUP_DIR              Backup storage directory (default: ./backups/)
  BACKUP_RETENTION_DAYS   Days to keep old backups (default: 30)

Examples:
  # Basic usage (reads DATABASE_URL from environment or .env.production)
  ./scripts/db-backup.sh

  # Custom backup directory and retention
  BACKUP_DIR=/mnt/backups BACKUP_RETENTION_DAYS=7 ./scripts/db-backup.sh

  # Cron entry (every day at 2 AM)
  0 2 * * * /path/to/scripts/db-backup.sh

HELP
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

NO_PRUNE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --retention)
      BACKUP_RETENTION_DAYS="$2"
      shift 2
      ;;
    --no-prune)
      NO_PRUNE=true
      shift
      ;;
    *)
      die "Unknown option: $1. Use --help for usage."
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Load .env.production if DATABASE_URL is not already set
if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.production"
  if [[ -f "$ENV_FILE" ]]; then
    log "Loading DATABASE_URL from $ENV_FILE"
    # Source only DATABASE_URL to avoid side effects
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)" || true
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  die "DATABASE_URL is not set. Provide it via environment or .env.production file."
fi

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# ---------------------------------------------------------------------------
# Parse DATABASE_URL into PG components
# ---------------------------------------------------------------------------

parse_database_url() {
  local url="$1"

  # Strip the scheme (postgresql:// or postgres://)
  local stripped="${url#*://}"

  # Extract user:password@host:port/database
  local userinfo="${stripped%%@*}"
  local hostinfo="${stripped#*@}"

  export PGUSER="${userinfo%%:*}"
  local pass_part="${userinfo#*:}"
  export PGPASSWORD="$pass_part"

  local hostport="${hostinfo%%/*}"
  export PGDATABASE="${hostinfo#*/}"
  # Remove any query string from database name
  PGDATABASE="${PGDATABASE%%\?*}"

  export PGHOST="${hostport%%:*}"
  local port_part="${hostport#*:}"
  export PGPORT="${port_part:-5432}"
}

log "Parsing DATABASE_URL..."
parse_database_url "$DATABASE_URL"
log "Database: $PGDATABASE @ $PGHOST:$PGPORT (user: $PGUSER)"

# ---------------------------------------------------------------------------
# Prepare backup directory
# ---------------------------------------------------------------------------

log "Backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR" || die "Failed to create backup directory: $BACKUP_DIR"

# ---------------------------------------------------------------------------
# Determine pg_dump method (local or Docker)
# ---------------------------------------------------------------------------

TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_FILE="slopguess_${TIMESTAMP}.sql"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

run_pg_dump() {
  if command -v pg_dump &>/dev/null; then
    log "Using local pg_dump"
    pg_dump \
      -h "$PGHOST" \
      -p "$PGPORT" \
      -U "$PGUSER" \
      -d "$PGDATABASE" \
      --no-password \
      -f "$BACKUP_PATH"
  elif command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    log "pg_dump not found locally; falling back to docker compose exec"
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T postgres \
      pg_dump \
        -h "$PGHOST" \
        -p "$PGPORT" \
        -U "$PGUSER" \
        -d "$PGDATABASE" \
        --no-password \
      > "$BACKUP_PATH"
  else
    die "Neither pg_dump nor docker compose is available. Cannot create backup."
  fi
}

# ---------------------------------------------------------------------------
# Execute backup
# ---------------------------------------------------------------------------

log "Starting backup: $BACKUP_FILE"
if ! run_pg_dump; then
  # Clean up partial file on failure
  rm -f "$BACKUP_PATH" "$BACKUP_PATH.gz"
  die "pg_dump failed. Check connection details and ensure the database is reachable."
fi

if [[ ! -s "$BACKUP_PATH" ]]; then
  rm -f "$BACKUP_PATH"
  die "Backup file is empty. pg_dump may have failed silently."
fi

log "Compressing backup..."
if ! gzip "$BACKUP_PATH"; then
  die "Failed to compress backup file."
fi

COMPRESSED="${BACKUP_PATH}.gz"
FILESIZE="$(du -h "$COMPRESSED" | cut -f1)"
log "Backup complete: $COMPRESSED ($FILESIZE)"

# ---------------------------------------------------------------------------
# Prune old backups
# ---------------------------------------------------------------------------

if [[ "$NO_PRUNE" == "false" ]]; then
  log "Pruning backups older than $BACKUP_RETENTION_DAYS days..."
  PRUNED=0
  while IFS= read -r -d '' old_file; do
    log "  Removing: $(basename "$old_file")"
    rm -f "$old_file"
    ((PRUNED++))
  done < <(find "$BACKUP_DIR" -name 'slopguess_*.sql.gz' -type f -mtime +"$BACKUP_RETENTION_DAYS" -print0 2>/dev/null)
  log "Pruned $PRUNED old backup(s)."
else
  log "Skipping pruning (--no-prune)."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "Backup successfully stored at: $COMPRESSED"
exit 0
