#!/bin/bash
# Apply the Supabase stub + every repo migration to the throwaway cluster.
set -uo pipefail
export PATH=/opt/homebrew/opt/postgresql@14/bin:$PATH
SP="$(cd "$(dirname "$0")" && pwd)"
MIG="/Users/adamalrashdi/Downloads/Medthawi/mediflow-ai-frontend_1/mediflow/supabase/migrations"
HOST=127.0.0.1; PORT=55432; DB=mediflow_test

psql -h $HOST -p $PORT -U postgres -qc "drop database if exists $DB;" >/dev/null 2>&1
psql -h $HOST -p $PORT -U postgres -qc "create database $DB;" >/dev/null

run() {
  local label="$1" file="$2" out rc
  out="$(psql -h $HOST -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q -f "$file" 2>&1)"
  rc=$?
  if [ $rc -eq 0 ]; then
    echo "  OK    $label"
  else
    echo "  FAIL  $label"
    echo "$out" | grep -v '^NOTICE' | head -15 | sed 's/^/          /'
    return 1
  fi
}

fails=0
run "00_supabase_stub" "$SP/00_supabase_stub.sql" || fails=$((fails+1))
for f in $(ls "$MIG"/*.sql | sort); do
  run "$(basename "$f")" "$f" || fails=$((fails+1))
done
echo
echo "FAILURES: $fails"
exit $fails
