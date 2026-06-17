#!/bin/bash
# Server watchdog — restarts the dev server if it dies
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200\|304"; then
    echo "[$(date)] Server down, restarting..."
    pkill -f "next-server" 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    sleep 2
    NODE_OPTIONS="--max-old-space-size=4096" nohup bun run dev >> dev.log 2>&1 &
    sleep 15
    echo "[$(date)] Server restarted: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>/dev/null)"
  fi
  sleep 10
done
