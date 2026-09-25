#!/usr/bin/env bash
# Run `tauri dev` on a given port with per-branch storage isolation.
# Each git branch gets its own app identifier, so Application Support
# data (sqlite db, project files) never collides across worktrees,
# even if two worktrees reuse the same port.
set -euo pipefail

port="$1"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
slug=$(printf '%s' "$branch" | tr -c 'a-zA-Z0-9' '-')

title="ProDiff ($port)"
if [ -n "$branch" ]; then
  title="$title $branch"
fi

config=$(jq -n \
  --arg identifier "com.nicoabarca.prodiff.dev-$slug" \
  --arg devCmd "pnpm dev --port $port" \
  --arg devUrl "http://localhost:$port" \
  --arg title "$title" \
  '{
    identifier: $identifier,
    build: {
      beforeDevCommand: $devCmd,
      devUrl: $devUrl
    },
    app: {
      windows: [{ title: $title, maximized: true }]
    }
  }')

exec tauri dev --config "$config"
