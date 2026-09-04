import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
const keys = JSON.parse(fs.readFileSync(new URL("./.keys.json", import.meta.url), "utf8"));
const transport = new hl.HttpTransport({ isTestnet: true });
for (const [name, amount] of [["trader", "499"], ["builder", "99"]]) {
  const wallet = privateKeyToAccount(keys[name]);
  const exch = new hl.ExchangeClient({ transport, wallet, isTestnet: true });
  try {
    const r = await exch.usdClassTransfer({ amount, toPerp: true });
    console.log(name, wallet.address, "spot->perp", amount, r.status);
  } catch (e) {
    console.log(name, wallet.address, "ERROR:", e.message?.slice(0, 200));
  }
}
