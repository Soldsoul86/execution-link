// Verify: entry + TP + SL as ONE grouped action (normalTpsl) on testnet.
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
const s = (15 / mid).toFixed(szDec);

// Entry (IOC marketable) + TP trigger (+2%) + SL trigger (-2%), grouping normalTpsl
try {
  const r = await exch.order({
    orders: [
      { a: idx, b: true, p: round(mid * 1.005), s, r: false, t: { limit: { tif: "Ioc" } } },
      { a: idx, b: false, p: round(mid * 1.03), s, r: true, t: { trigger: { isMarket: true, triggerPx: round(mid * 1.02), tpsl: "tp" } } },
      { a: idx, b: false, p: round(mid * 0.97), s, r: true, t: { trigger: { isMarket: true, triggerPx: round(mid * 0.98), tpsl: "sl" } } },
    ],
    grouping: "normalTpsl",
    builder: { b: builder.address, f: 40 },
  });
  console.log("BRACKET OK:", JSON.stringify(r.response.data.statuses).slice(0, 400));
} catch (e) {
  console.log("BRACKET REJECTED:", e.message?.slice(0, 300));
}

// State check + cleanup: close position (cancels linked tpsl children automatically?)
const st = await info.clearinghouseState({ user: trader.address });
const pos = st.assetPositions.find((p) => p.position.coin === "BTC");
console.log("position:", pos ? pos.position.szi : "none");
const oo = await info.openOrders({ user: trader.address });
console.log("open orders:", oo.map((o) => `${o.coin} ${o.side} ${o.sz}@${o.limitPx} oid=${o.oid}`));
if (pos && Number(pos.position.szi) !== 0) {
  await exch.order({
    orders: [{ a: idx, b: false, p: round(mid * 0.995), s: Math.abs(Number(pos.position.szi)).toFixed(szDec), r: true, t: { limit: { tif: "Ioc" } } }],
    grouping: "na", builder: { b: builder.address, f: 40 },
  });
  console.log("position closed");
}
const oo2 = await info.openOrders({ user: trader.address });
if (oo2.length) {
  await exch.cancel({ cancels: oo2.filter(o => o.coin === "BTC").map((o) => ({ a: idx, o: o.oid })) });
  console.log("cancelled", oo2.length, "residual orders");
}
console.log("final open orders:", (await info.openOrders({ user: trader.address })).length);
