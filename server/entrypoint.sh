#!/bin/sh
set -e

echo "==> Running database migrations..."
node dist/db/migrate.js || echo "Warning: Migrations failed (server will start anyway)"

echo "==> Starting server..."
exec "$@"
