import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync(new URL("./.keys.json", import.meta.url), "utf8"));
const transport = new hl.HttpTransport({ isTestnet: true });
const info = new hl.InfoClient({ transport });
const builder = privateKeyToAccount(keys.builder);
const trader = privateKeyToAccount(keys.trader);
const bExch = new hl.ExchangeClient({ transport, wallet: builder, isTestnet: true });
const tExch = new hl.ExchangeClient({ transport, wallet: trader, isTestnet: true });

// Move builder's remaining spot USDC to perps
try {
  const r = await bExch.usdClassTransfer({ amount: "1", toPerp: true });
  console.log("builder spot->perp 1:", r.status);
} catch (e) { console.log("builder spot->perp:", e.message?.slice(0,120)); }

let st = await info.clearinghouseState({ user: builder.address });
console.log("builder perps value:", st.marginSummary.accountValue);

// Try approval from trader
try {
  const r = await tExch.approveBuilderFee({ maxFeeRate: "0.05%", builder: builder.address });
  console.log("approveBuilderFee at 100:", r.status);
} catch (e) {
  console.log("approval still failing:", e.message?.slice(0,120));
  // Fallback: send 5 USDC trader -> builder perps
  const s = await tExch.usdSend({ destination: builder.address, amount: "5" });
  console.log("usdSend trader->builder 5:", s.status);
  st = await info.clearinghouseState({ user: builder.address });
  console.log("builder perps value now:", st.marginSummary.accountValue);
  const r2 = await tExch.approveBuilderFee({ maxFeeRate: "0.05%", builder: builder.address });
  console.log("approveBuilderFee retry:", r2.status);
}
