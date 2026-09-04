import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync(new URL("./.keys.json", import.meta.url), "utf8"));
const transport = new hl.HttpTransport({ isTestnet: true });
const info = new hl.InfoClient({ transport });
const trader = privateKeyToAccount(keys.trader);
const builder = privateKeyToAccount(keys.builder);
const exch = new hl.ExchangeClient({ transport, wallet: trader, isTestnet: true });

const [maac, mids] = await Promise.all([info.metaAndAssetCtxs(), info.allMids()]);
const meta = maac[0], ctxs = maac[1];
const idx = meta.universe.findIndex((u) => u.name === "BTC");
const szDec = meta.universe[idx].szDecimals;
const ctx = ctxs[idx];
const mid = Number(mids["BTC"]);
console.log("mid:", mid, "oraclePx:", ctx.oraclePx, "markPx:", ctx.markPx);
const oracle = Number(ctx.oraclePx);
const round = (px) => Number(Number(px.toPrecision(5)).toFixed(Math.max(0, 6 - szDec))).toString();
const s = (15 / mid).toFixed(szDec);

async function tryBracket(label, tpP, slP) {
  try {
    const r = await exch.order({
      orders: [
        { a: idx, b: true, p: round(oracle * 1.005), s, r: false, t: { limit: { tif: "Ioc" } } },
        { a: idx, b: false, p: tpP, s, r: true, t: { trigger: { isMarket: true, triggerPx: round(oracle * 1.02), tpsl: "tp" } } },
        { a: idx, b: false, p: slP, s, r: true, t: { trigger: { isMarket: true, triggerPx: round(oracle * 0.98), tpsl: "sl" } } },
      ],
      grouping: "normalTpsl",
      builder: { b: builder.address, f: 40 },
    });
    console.log(label, "OK:", JSON.stringify(r.response.data.statuses).slice(0, 300));
    return true;
  } catch (e) {
    console.log(label, "REJ:", e.message?.slice(0, 160));
    return false;
  }
}

// V1: trigger limit prices AT the trigger px (common integrator pattern)
let ok = await tryBracket("V1 p=triggerPx", round(oracle * 1.02), round(oracle * 0.98));
// V2: wide slippage prices (10% from trigger) — tests whether triggers are band-exempt
if (!ok) ok = await tryBracket("V2 p=trigger±10%", round(oracle * 0.92), round(oracle * 0.89));
// V3: p within 1% of oracle
if (!ok) ok = await tryBracket("V3 p=oracle±1%", round(oracle * 0.995), round(oracle * 0.995));

// state + cleanup
const st = await info.clearinghouseState({ user: trader.address });
const pos = st.assetPositions.find((p) => p.position.coin === "BTC");
const oo = await info.openOrders({ user: trader.address });
console.log("position:", pos ? pos.position.szi : "none", "| open orders:", oo.map((o) => `${o.side}@${o.limitPx}${o.isTrigger ? " trig" : ""}`));
if (pos && Number(pos.position.szi) !== 0) {
  await exch.order({ orders: [{ a: idx, b: false, p: round(oracle * 0.995), s: Math.abs(Number(pos.position.szi)).toFixed(szDec), r: true, t: { limit: { tif: "Ioc" } } }], grouping: "na", builder: { b: builder.address, f: 40 } });
  console.log("closed");
}
const oo2 = await info.openOrders({ user: trader.address });
if (oo2.length) { await exch.cancel({ cancels: oo2.map((o) => ({ a: idx, o: o.oid })) }); console.log("cancelled", oo2.length); }
