// Registry-locked links (EXP-010 security model): the page renders ONLY trades
// defined here. Link params are immutable per deploy — a malicious/altered URL
// cannot change what the user signs. Add a trade, redeploy, share /?t=<id>.

export interface TradeDef {
  id: string;
  /** Perp coin name exactly as in HL meta universe, e.g. "BTC", "ETH". */
  coin: string;
  /** true = long/buy, false = short/sell */
  isBuy: boolean;
  /** Order size in USD notional (converted to base size at current mid). */
  usdNotional: number;
  /** Optional leverage to set before the order. Omit = keep account setting. */
  leverage?: number;
  /** Cross margin (true) or isolated (false). Only used when leverage is set. */
  isCross?: boolean;
  /** KOL attribution id ("" = house link). Shown on the card when present. */
  kolId: string;
  /** KOL display handle for the card, e.g. "@trader". */
  kolHandle?: string;
  /** Short human line shown under the title. */
  note?: string;
}

export const TRADES: TradeDef[] = [
  {
    id: "demo-btc-long",
    coin: "BTC",
    isBuy: true,
    usdNotional: 100,
    kolId: "",
    note: "Demo trade for testnet dry-runs (EXP-010 checklist).",
  },
  {
    id: "demo-eth-short",
    coin: "ETH",
    isBuy: false,
    usdNotional: 100,
    kolId: "",
    note: "Demo short for failure-mode testing.",
  },
];

export function getTrade(id: string | null): TradeDef | undefined {
  if (!id) return undefined;
  return TRADES.find((t) => t.id === id);
}
