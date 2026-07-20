#!/usr/bin/env bash
set -euo pipefail

EXPECTED_CONTAINER="supabase_db_rc-local-e2e-supabase"

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd
)"

SCHEMA_FILE="$SCRIPT_DIR/schema.sql"
FIXTURE_FILE="$SCRIPT_DIR/fixture.sql"

echo "=== REINISCH CLASSROOM LOCAL E2E DATABASE RESET ==="
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "STOP: docker is not available."
  exit 1
fi

if ! docker inspect "$EXPECTED_CONTAINER" >/dev/null 2>&1; then
  echo "STOP: Expected local E2E database container is not running:"
  echo "$EXPECTED_CONTAINER"
  exit 1
fi

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "STOP: schema.sql is missing."
  exit 1
fi

if [ ! -f "$FIXTURE_FILE" ]; then
  echo "STOP: fixture.sql is missing."
  exit 1
fi

db_binding="$(
  docker port "$EXPECTED_CONTAINER" 5432/tcp 2>/dev/null || true
)"

case "$db_binding" in
  127.0.0.1:*)
    ;;
  *)
    echo "STOP: Expected PostgreSQL to be bound only to 127.0.0.1."
    echo "Observed binding: ${db_binding:-none}"
    exit 1
    ;;
esac

echo "PASS: Expected local E2E database container is running."
echo "PASS: PostgreSQL is bound to localhost only."
echo
echo "Resetting synthetic local E2E database..."

{
  echo "SET rc.local_e2e = '1';"
  cat "$SCHEMA_FILE"
  cat "$FIXTURE_FILE"
} | docker exec -i "$EXPECTED_CONTAINER" \
      psql \
        -U postgres \
        -d postgres \
        -v ON_ERROR_STOP=1

echo
echo "=== SYNTHETIC FIXTURE COUNTS ==="

docker exec -i "$EXPECTED_CONTAINER" \
  psql \
    -U postgres \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -P pager=off \
    -c "
      SELECT
        (SELECT count(*) FROM public.teacher) AS teachers,
        (SELECT count(*) FROM public.classes) AS classes,
        (SELECT count(*) FROM public.students) AS students,
        (SELECT count(*) FROM public.class_enrollments) AS enrollments,
        (SELECT count(*) FROM public.goals) AS goals,
        (SELECT count(*) FROM public.app_users) AS app_users,
        (SELECT count(*) FROM public.assignments) AS assignments,
        (SELECT count(*) FROM public.assignment_instances) AS instances,
        (SELECT count(*) FROM public.submissions) AS submissions,
        (SELECT count(*) FROM public.goal_progress) AS goal_progress,
        (SELECT count(*) FROM public.goal_data_points) AS goal_data_points;
    "

echo
echo "=== RESET COMPLETE ==="
echo "Synthetic local E2E database is ready."
echo "No production system was contacted."
