import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync(new URL("./.keys.json", import.meta.url), "utf8"));
const transport = new hl.HttpTransport({ isTestnet: true });
const info = new hl.InfoClient({ transport });
const trader = privateKeyToAccount(keys.trader);
const builder = privateKeyToAccount(keys.builder);
const exch = new hl.ExchangeClient({ transport, wallet: trader, isTestnet: true });
const [maac, mids, book] = await Promise.all([info.metaAndAssetCtxs(), info.allMids(), info.l2Book({ coin: "BTC" })]);
const meta = maac[0]; const idx = meta.universe.findIndex((u) => u.name === "BTC");
const szDec = meta.universe[idx].szDecimals;
const oracle = Number(maac[1][idx].oraclePx);
const bestAsk = Number(book.levels[1][0].px);
console.log("oracle:", oracle, "bestAsk:", bestAsk, "ask/oracle:", (bestAsk/oracle-1)*100, "%");
const round = (px) => Number(Number(px.toPrecision(5)).toFixed(Math.max(0, 6 - szDec))).toString();
const s = (15 / bestAsk).toFixed(szDec);

async function tryBracket(label, entryP, tpP, slP) {
  try {
    const r = await exch.order({
      orders: [
        { a: idx, b: true, p: entryP, s, r: false, t: { limit: { tif: "Ioc" } } },
        { a: idx, b: false, p: tpP, s, r: true, t: { trigger: { isMarket: true, triggerPx: round(bestAsk * 1.02), tpsl: "tp" } } },
        { a: idx, b: false, p: slP, s, r: true, t: { trigger: { isMarket: true, triggerPx: round(bestAsk * 0.98), tpsl: "sl" } } },
      ],
      grouping: "normalTpsl", builder: { b: builder.address, f: 40 },
    });
    console.log(label, "OK:", JSON.stringify(r.response.data.statuses).slice(0, 400));
    return true;
  } catch (e) { console.log(label, "REJ:", e.message?.slice(0, 140)); return false; }
}
// entry exactly at best ask (marketable, minimal oracle distance); triggers at trigger-px
const ok = await tryBracket("V4 entry=bestAsk", round(bestAsk), round(bestAsk * 1.02), round(bestAsk * 0.98));

const st = await info.clearinghouseState({ user: trader.address });
const pos = st.assetPositions.find((p) => p.position.coin === "BTC");
const oo = await info.openOrders({ user: trader.address });
console.log("position:", pos ? pos.position.szi : "none", "| open:", oo.map((o) => `${o.side}${o.isTrigger?"T":""}@${o.isTrigger?o.triggerPx:o.limitPx}`));
// cleanup
if (pos && Number(pos.position.szi) !== 0) {
  const bb = Number((await info.l2Book({ coin: "BTC" })).levels[0][0].px);
  await exch.order({ orders: [{ a: idx, b: false, p: round(bb), s: Math.abs(Number(pos.position.szi)).toFixed(szDec), r: true, t: { limit: { tif: "Ioc" } } }], grouping: "na", builder: { b: builder.address, f: 40 } });
  console.log("closed");
}
const oo2 = await info.openOrders({ user: trader.address });
if (oo2.length) { await exch.cancel({ cancels: oo2.map((o) => ({ a: idx, o: o.oid })) }); console.log("cancelled", oo2.length); }
console.log("final flat:", (await info.openOrders({ user: trader.address })).length === 0);
