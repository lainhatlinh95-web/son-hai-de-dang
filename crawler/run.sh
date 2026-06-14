#!/bin/bash
# ============================================================
# Daily wrapper for the LaunchAgent: crawl, then commit & push
# any new chapters so GitHub Pages redeploys.
# ============================================================
set -uo pipefail

CRAWLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$CRAWLER_DIR/.." && pwd)"
LOG="$CRAWLER_DIR/.secrets/crawl.log"
mkdir -p "$CRAWLER_DIR/.secrets"

# Load nvm so `node` is on PATH under launchd's minimal environment.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
  cd "$REPO_DIR" || exit 1

  node "$CRAWLER_DIR/crawl.mjs"

  if ! git diff --quiet -- data/chapters.json; then
    git add data/chapters.json
    git commit -m "chore: add new chapter(s) from daily crawl" \
      && git push origin main \
      && echo "Pushed new chapters."
  else
    echo "No new chapters."
  fi
} >> "$LOG" 2>&1
