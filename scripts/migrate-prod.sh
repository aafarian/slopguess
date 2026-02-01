#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SlopGuesser - Production Database Migration Runner
# =============================================================================
# Runs database migrations against the production database via Docker.
#
# Wraps the existing `npx tsx src/db/migrate.ts` script so that it runs inside
# the production server container with the correct environment variables.
#
# Usage:
#   ./scripts/migrate-prod.sh status               # Show migration state
#   ./scripts/migrate-prod.sh up                    # Backup + apply migrations
#   ./scripts/migrate-prod.sh up --dry-run          # Show pending (no apply)
#   ./scripts/migrate-prod.sh up --no-backup        # Skip pre-migration backup
#   ./scripts/migrate-prod.sh down                  # Rollback last migration
#   ./scripts/migrate-prod.sh --help                # Print usage
#
# Exit codes:
#   0 - Success
#   1 - Error (container not running, migration failed, etc.)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Docker Compose files for production
COMPOSE_FILES="-f $PROJECT_ROOT/docker-compose.yml -f $PROJECT_ROOT/docker-compose.prod.yml"
SERVER_CONTAINER="slopguess-server"

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
Usage: migrate-prod.sh <command> [OPTIONS]

Run database migrations against the production database via Docker.

Commands:
  up        Apply all pending migrations (default)
  down      Rollback the most recent migration
  status    Show applied and pending migrations

Options:
  --dry-run      (up only) Show pending migrations without applying them
  --no-backup    (up only) Skip the automatic pre-migration backup
  --help, -h     Show this help message and exit

Examples:
  # Check current migration state
  ./scripts/migrate-prod.sh status

  # Apply pending migrations (with automatic backup)
  ./scripts/migrate-prod.sh up

  # Preview pending migrations without applying
  ./scripts/migrate-prod.sh up --dry-run

  # Apply migrations without pre-migration backup
  ./scripts/migrate-prod.sh up --no-backup

  # Rollback the last applied migration
  ./scripts/migrate-prod.sh down

Environment:
  Loads .env.production from the project root if it exists.
  Uses Docker Compose production files:
    docker-compose.yml + docker-compose.prod.yml

HELP
}

# ---------------------------------------------------------------------------
# Load production environment
# ---------------------------------------------------------------------------

load_env() {
  local env_file="$PROJECT_ROOT/.env.production"
  if [[ -f "$env_file" ]]; then
    log "Loading environment from $env_file"
    # Export variables from .env.production (skip comments and blank lines)
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^[A-Z_][A-Z0-9_]*=' "$env_file" | sed 's/^/export /')
    set +a
  fi
}

# ---------------------------------------------------------------------------
# Container health check
# ---------------------------------------------------------------------------

verify_server_running() {
  log "Verifying server container is running..."

  if ! command -v docker &>/dev/null; then
    die "docker is not installed or not in PATH."
  fi

  # Check if the server container is running
  local container_state
  container_state="$(docker inspect -f '{{.State.Running}}' "$SERVER_CONTAINER" 2>/dev/null || echo "missing")"

  if [[ "$container_state" != "true" ]]; then
    die "Server container '$SERVER_CONTAINER' is not running. Start the production stack first:
  docker compose $COMPOSE_FILES up -d"
  fi

  log "Server container '$SERVER_CONTAINER' is running."
}

# ---------------------------------------------------------------------------
# Run migration command inside Docker
# ---------------------------------------------------------------------------

run_migration() {
  local command="$1"
  log "Executing migration command: $command"

  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES exec -T server npx tsx src/db/migrate.ts "$command"
  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    die "Migration command '$command' failed with exit code $exit_code."
  fi

  return 0
}

# ---------------------------------------------------------------------------
# Pre-migration backup
# ---------------------------------------------------------------------------

run_backup() {
  local backup_script="$SCRIPT_DIR/db-backup.sh"

  if [[ ! -x "$backup_script" ]]; then
    die "Backup script not found or not executable: $backup_script"
  fi

  log "Running pre-migration backup..."
  if ! "$backup_script"; then
    die "Pre-migration backup failed. Aborting migration."
  fi

  log "Pre-migration backup completed successfully."
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

COMMAND=""
DRY_RUN=false
NO_BACKUP=false

# Handle --help before command
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

# First non-flag argument is the command
if [[ $# -gt 0 && "${1:0:1}" != "-" ]]; then
  COMMAND="$1"
  shift
fi

# Default command
COMMAND="${COMMAND:-up}"

# Parse remaining flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-backup)
      NO_BACKUP=true
      shift
      ;;
    *)
      die "Unknown option: $1. Use --help for usage."
      ;;
  esac
done

# Validate command
case "$COMMAND" in
  up|down|status) ;;
  *)
    die "Unknown command: $COMMAND. Valid commands: up, down, status. Use --help for usage."
    ;;
esac

# Validate flag combinations
if [[ "$DRY_RUN" == "true" && "$COMMAND" != "up" ]]; then
  die "--dry-run is only valid with the 'up' command."
fi

if [[ "$NO_BACKUP" == "true" && "$COMMAND" != "up" ]]; then
  die "--no-backup is only valid with the 'up' command."
fi

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

log "=========================================="
log " SlopGuesser Production Migration Runner"
log "=========================================="
log " Command:    $COMMAND"
log " Dry run:    $DRY_RUN"
log " No backup:  $NO_BACKUP"
log " Project:    $PROJECT_ROOT"
log "=========================================="

# Load environment
load_env

# Verify server container is running
verify_server_running

# Execute based on command
case "$COMMAND" in
  status)
    log "Fetching migration status..."
    run_migration status
    ;;

  up)
    if [[ "$DRY_RUN" == "true" ]]; then
      log "DRY RUN: Showing pending migrations without applying..."
      run_migration status
      log "DRY RUN complete. No migrations were applied."
    else
      # Run pre-migration backup unless skipped
      if [[ "$NO_BACKUP" == "true" ]]; then
        log "Skipping pre-migration backup (--no-backup)."
      else
        run_backup
      fi

      log "Applying pending migrations..."
      run_migration up
      log "Migrations applied successfully."
    fi
    ;;

  down)
    log "Rolling back the most recent migration..."
    run_migration down
    log "Rollback completed successfully."
    ;;
esac

log "=========================================="
log " Migration operation completed"
log "=========================================="
exit 0
