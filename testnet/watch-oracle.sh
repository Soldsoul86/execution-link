#!/bin/bash
# Re-probe brackets every 15 min until testnet oracle converges with mid (<1%).
cd "$(dirname "$0")/.."
for i in $(seq 1 48); do
  OUT=$(node testnet/bracket-probe3.mjs 2>&1)
  if echo "$OUT" | grep -q "V4 entry=bestAsk OK"; then
    echo "BRACKET VERIFIED on testnet:"; echo "$OUT"; exit 0
  fi
  echo "probe $i: not yet ($(echo "$OUT" | grep 'oracle:' | head -1))"
  sleep 900
done
echo "TIMEOUT after 12h — oracle still diverged"; exit 2
