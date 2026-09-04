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

// close any leftover position first
const st = await info.clearinghouseState({ user: trader.address });
const pos = st.assetPositions.find((p) => p.position.coin === "BTC");
if (pos && Number(pos.position.szi) !== 0) {
  const szi = Number(pos.position.szi);
  await exch.order({ orders: [{ a: idx, b: szi < 0, p: round(szi > 0 ? mid*0.995 : mid*1.005), s: Math.abs(szi).toFixed(szDec), r: true, t: { limit: { tif: "Ioc" } } }], grouping: "na", builder: { b: builder.address, f: 40 } });
  console.log("closed leftover", szi);
}

// GTC bid far below mid, $5,000 at 1x with ~$460 -> expect hard margin rejection
try {
  const r = await exch.order({
    orders: [{ a: idx, b: true, p: round(mid * 0.8), s: (5000 / (mid*0.8)).toFixed(szDec), r: false, t: { limit: { tif: "Gtc" } } }],
    grouping: "na", builder: { b: builder.address, f: 40 },
  });
  const s0 = r.response.data.statuses[0];
  console.log("unexpected accept:", JSON.stringify(s0).slice(0,150));
  if (s0 && "resting" in s0) { await exch.cancel({ cancels: [{ a: idx, o: s0.resting.oid }] }); console.log("cancelled resting order"); }
} catch (e) {
  console.log("MARGIN REJECT STRING:", e.message?.slice(0, 200));
}
const st2 = await info.clearinghouseState({ user: trader.address });
console.log("final trader accountValue:", st2.marginSummary.accountValue, "positions:", st2.assetPositions.length);
