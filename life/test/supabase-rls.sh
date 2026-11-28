#!/usr/bin/env bash
# Runs supabase/tests/rls_check.sql against the project through the Management API.
# Needs a Supabase personal access token (injected by the session proxy) and the project ref.
set -euo pipefail
REF="${SUPABASE_REF:-uuamddvxaownewcfpczt}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$ROOT/supabase/tests/rls_check.sql" \
  | curl -s -X POST -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:-proxy-injected}" -H "Content-Type: application/json" \
      "https://api.supabase.com/v1/projects/$REF/database/query" --data-binary @- \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); rows=[x["rls_check"] for x in r] if isinstance(r,list) else [str(r)]; print("\n".join(rows)); sys.exit(0 if rows and all(not x.startswith("FAIL") for x in rows) and any(x.startswith("CLEAN") for x in rows) else 1)'
