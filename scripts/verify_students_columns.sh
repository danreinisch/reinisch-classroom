#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL (e.g. https://<ref>.supabase.co)}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"

cols=(iep_due eval_due primary_case_manager archived_at active)

fail=0
for col in "${cols[@]}"; do
  url="${SUPABASE_URL%/}/rest/v1/students?select=id,code,${col}&limit=1"
  resp="$(curl -sS -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" -w "\nHTTP_STATUS:%{http_code}\n" "$url" || true)"
  status="$(printf "%s" "$resp" | awk -F: '/HTTP_STATUS/ {print $2}' | tail -n1 | tr -d '\r')"
  body="$(printf "%s" "$resp" | sed '/HTTP_STATUS:/,$d')"

  if [ "$status" = "200" ]; then
    echo "✅ PASS: students.${col} (HTTP 200)"
  else
    echo "❌ FAIL: students.${col} (HTTP $status)"
    echo "$body" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-220
    echo ""
    fail=1
  fi
done

exit $fail
