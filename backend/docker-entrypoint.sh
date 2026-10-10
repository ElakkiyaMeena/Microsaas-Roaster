#!/bin/sh
set -e

# Apply database migrations, then start the API server.
alembic upgrade head

exec "$@"
