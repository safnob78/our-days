#!/usr/bin/env bash
# Start the Our Days sync server and (optionally) expose it over Tailscale.
# Data is stored under ./server-data (git-ignored). Ctrl-C flushes and exits.
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8787}"
echo "Starting Our Days on port $PORT ..."
# Keep the laptop awake while serving (systemd-logind). Harmless if unavailable.
if command -v systemd-inhibit >/dev/null 2>&1; then
  exec systemd-inhibit --what=sleep:idle --why="Our Days sync server" \
       env PORT="$PORT" node server.js
else
  exec env PORT="$PORT" node server.js
fi
