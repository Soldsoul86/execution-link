#!/bin/bash
# Polls testnet for trader funding; when funded, runs the full checklist once.
TRADER="0x80a161f927849a501A30cB56bC20D5b74faBA519"
for i in $(seq 1 120); do
  VAL=$(curl -s -m 10 -X POST "https://api.hyperliquid-testnet.xyz/info" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"clearinghouseState\",\"user\":\"$TRADER\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['marginSummary']['accountValue'])" 2>/dev/null)
  if [ -n "$VAL" ] && [ "$(echo "$VAL > 1" | bc 2>/dev/null)" = "1" ]; then
    echo "FUNDED: accountValue=$VAL after $((i*60))s — running checklist"
    cd "$(dirname "$0")/.." && node testnet/checklist.mjs
    exit $?
  fi
  sleep 60
done
echo "TIMEOUT: trader not funded within 2h (accountValue=$VAL)"
exit 2
