#!/usr/bin/env bash
set -euo pipefail
remote="${1:-origin}"
branch="$(git rev-parse --abbrev-ref HEAD)"
for attempt in 1 2 3; do
  git fetch "$remote"
  git pull --rebase "$remote" "$branch"
  if git push "$remote" "HEAD:$branch"; then
    exit 0
  fi
  echo "push rejected (attempt ${attempt}), retrying…"
  sleep 10
done
echo "push failed after 3 attempts" >&2
exit 1
