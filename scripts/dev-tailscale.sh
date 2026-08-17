#!/usr/bin/env bash
set -euo pipefail

bind_ip="${TAILSCALE_BIND_IP:-}"
if [[ -z "$bind_ip" ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    printf '%s\n' 'tailscale command not found; set TAILSCALE_BIND_IP explicitly.' >&2
    exit 1
  fi
  bind_ip="$(tailscale ip -4 | head -n 1)"
fi

if [[ ! "$bind_ip" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
  printf '%s\n' 'No valid Tailscale IPv4 address was found.' >&2
  exit 1
fi

bind_port="${WORKBENCH_PORT:-3002}"
exec next dev --hostname "$bind_ip" --port "$bind_port"
