#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"
env_args=()
if [[ -f "$repo_dir/.env.local" ]]; then
  env_args+=("--env-file=$repo_dir/.env.local")
fi

exec "$repo_dir/node_modules/.bin/tsx" "${env_args[@]}" "$script_dir/research-worker.ts" "$@"
