#!/bin/bash
ulimit -n 65536
export NODE_OPTIONS="--max-old-space-size=4096"
exec npx next start -p 3000
