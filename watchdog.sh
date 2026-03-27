#!/bin/bash
# Agent Space watchdog — restarts server if it dies
cd "$(dirname "$0")"
while true; do
  if ! curl -s -o /dev/null -w '' http://localhost:18790 2>/dev/null; then
    echo "[$(date)] Agent Space down — restarting..." >> watchdog.log
    node server.js >> server.log 2>&1 &
    sleep 3
  fi
  sleep 30
done
