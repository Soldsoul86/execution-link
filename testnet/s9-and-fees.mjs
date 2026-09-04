import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync(new URL("./.keys.json", import.meta.url), "utf8"));
const transport = new hl.HttpTransport({ isTestnet: true });
const info = new hl.InfoClient({ transport });
const trader = privateKeyToAccount(keys.trader);
const builder = privateKeyToAccount(keys.builder);
const exch = new hl.ExchangeClient({ transport, wallet: trader, isTestnet: true });

const [meta, mids] = await Promise.all([info.meta(), info.allMids()]);
const idx = meta.universe.findIndex((u) => u.name === "BTC");
const szDec = meta.universe[idx].szDecimals;
const mid = Number(mids["BTC"]);
const round = (px) => Number(Number(px.toPrecision(5)).toFixed(Math.max(0, 6 - szDec))).toString();

// Cleanup: close leftover long from the flawed S9 (reduce-only)
const st = await info.clearinghouseState({ user: trader.address });
const pos = st.assetPositions.find((p) => p.position.coin === "BTC");
if (pos && Number(pos.position.szi) !== 0) {
  const szi = Number(pos.position.szi);
  const r = await exch.order({
    orders: [{ a: idx, b: szi < 0, p: round(szi > 0 ? mid * 0.995 : mid * 1.005), s: Math.abs(szi).toFixed(szDec), r: true, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
    builder: { b: builder.address, f: 40 },
  });
  console.log("cleanup close:", JSON.stringify(r.response.data.statuses[0]).slice(0, 120));
}

// S9 fixed: 1x leverage, then $5,000 order with ~$460 free margin -> must reject
await exch.updateLeverage({ asset: idx, isCross: true, leverage: 1 });
console.log("leverage set to 1x");
try {
  const r = await exch.order({
    orders: [{ a: idx, b: true, p: round(mid * 1.005), s: (5000 / mid).toFixed(szDec), r: false, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
    builder: { b: builder.address, f: 40 },
  });
  console.log("S9 FAIL — unexpectedly accepted:", JSON.stringify(r.response.data.statuses[0]).slice(0, 200));
} catch (e) {
  console.log("S9 PASS — rejected with:", e.message?.slice(0, 160));
}

// FEE ACCRUAL — the point of the whole experiment
const fills = await info.userFills({ user: trader.address });
let vol = 0, builderFees = 0;
for (const f of fills) {
  vol += Number(f.px) * Number(f.sz);
  if (f.builderFee) builderFees += Number(f.builderFee);
}
console.log(`trader fills: ${fills.length}, routed notional: $${vol.toFixed(2)}, builderFee charged (from fills): $${builderFees.toFixed(4)}`);
const ref = await info.referral({ user: builder.address });
console.log("builder claimable state:", JSON.stringify(ref).slice(0, 400));
