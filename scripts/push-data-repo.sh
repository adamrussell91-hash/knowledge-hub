#!/usr/bin/env bash
set -euo pipefail
remote="${1:-origin}"
branch="$(git rev-parse --abbrev-ref HEAD)"
hub="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="$(pwd)"

repair_manifest_rebase() {
  if [ ! -d .git/rebase-merge ] && [ ! -d .git/rebase-apply ]; then
    return 1
  fi
  if ! git diff --name-only --diff-filter=U | grep -qx 'manifest.json'; then
    echo "rebase conflict is not only manifest.json" >&2
    return 1
  fi
  # During rebase, --ours is the upstream commit we are replaying onto.
  git checkout --ours -- manifest.json
  git add manifest.json
  if [ -f "$hub/scripts/sync-manifest-from-pages.ts" ]; then
    (cd "$hub" && npx tsx scripts/sync-manifest-from-pages.ts --data-dir "$data_dir" --execute)
    git add manifest.json
  fi
  GIT_EDITOR=true git rebase --continue
}

for attempt in 1 2 3; do
  git fetch "$remote"
  if ! git pull --rebase "$remote" "$branch"; then
    repair_manifest_rebase || {
      echo "rebase failed (attempt ${attempt})" >&2
      exit 1
    }
  fi
  if git push "$remote" "HEAD:$branch"; then
    exit 0
  fi
  echo "push rejected (attempt ${attempt}), retrying…"
  sleep 10
done
echo "push failed after 3 attempts" >&2
exit 1
