#!/usr/bin/env bash
# Applies one SQL file to the project through the Supabase Management API.
# The personal access token is injected by the session's network proxy (never stored in the repo).
set -euo pipefail
REF="${SUPABASE_REF:-uuamddvxaownewcfpczt}"
python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1" \
  | curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:-proxy-injected}" -H "Content-Type: application/json" \
      "https://api.supabase.com/v1/projects/$REF/database/query" --data-binary @-
