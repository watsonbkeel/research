#!/usr/bin/env bash
set -euo pipefail

session_name="${RESEARCH_WORKER_TMUX_SESSION:-article-worker}"
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$repo_dir/.local"
mkdir -p "$log_dir"

if tmux has-session -t "$session_name" 2>/dev/null; then
  printf 'Research worker is already running in tmux session %s\n' "$session_name"
  exit 0
fi

tmux new-session -d -s "$session_name" "cd '$repo_dir' && exec npm run worker >> '$log_dir/research-worker.log' 2>&1"
printf 'Started research worker in tmux session %s\n' "$session_name"
