#!/bin/sh
set -eu
# Runtime storage must remain PostgreSQL-only; SQLite is limited to the import tool.
if grep -R -q 'node:sqlite' /app/apps/server/src; then
  echo 'PG_MIGRATION_REQUIRED: current server still imports SQLite; target template cannot run it.' >&2
  exit 78
fi
: "${DATABASE_URL:?PG DATABASE_URL required}"
: "${HOST:?configurable bind address required}"
exec node /app/apps/server/src/index.ts
