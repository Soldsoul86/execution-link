// Hyperliquid glue. Every call here is grounded in @nktkas/hyperliquid v0.24 types.
// Fully client-side: the user's wallet signs; nothing touches any server of ours.

import * as hl from "@nktkas/hyperliquid";
import { createWalletClient, custom, type WalletClient } from "viem";
import {
  APPROVAL_MAX_FEE_RATE,
  BUILDER_ADDRESS,
  BUILDER_FEE_TENTHS_BP,
  IS_MAINNET,
  SLIPPAGE,
} from "./config";

const transport = new hl.HttpTransport({ isTestnet: !IS_MAINNET });
export const infoClient = new hl.InfoClient({ transport });

export interface AssetInfo {
  index: number;
  szDecimals: number;
  maxLeverage: number;
  mid: number;
}

export async function getAssetInfo(coin: string): Promise<AssetInfo> {
  const [meta, mids] = await Promise.all([infoClient.meta(), infoClient.allMids()]);
  const index = meta.universe.findIndex((u) => u.name === coin);
  if (index === -1) throw new Error(`Asset ${coin} not found in venue metadata`);
  const mid = Number(mids[coin]);
  if (!Number.isFinite(mid) || mid <= 0) throw new Error(`No mid price for ${coin}`);
  const u = meta.universe[index];
  return { index, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage, mid };
}

// HL perp price rules: at most 5 significant figures AND at most
// (6 - szDecimals) decimal places. Integer prices are always allowed.
export function roundPrice(px: number, szDecimals: number): string {
  const maxDecimals = 6 - szDecimals;
  let p = Number(px.toPrecision(5));
  p = Number(p.toFixed(Math.max(0, maxDecimals)));
  return trimZeros(p.toFixed(Math.max(0, maxDecimals)));
}

export function roundSize(sz: number, szDecimals: number): string {
  return trimZeros(sz.toFixed(szDecimals));
}

function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

export interface ConnectedWallet {
  address: `0x${string}`;
  walletClient: WalletClient;
}

export async function connectWallet(): Promise<ConnectedWallet> {
  // DEV-ONLY test wallet: lets the full UI flow run headlessly on TESTNET
  // (EXP-010 checklist automation). Hard-gated: dev build + testnet only;
  // stripped from production bundles by the import.meta.env.DEV check.
  if (import.meta.env.DEV && !IS_MAINNET && import.meta.env.VITE_TEST_KEY) {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(import.meta.env.VITE_TEST_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      transport: custom({
        // Minimal EIP-1193 shim; the SDK only signs typed data via the account.
        request: async () => {
          throw new Error("test wallet: RPC not available");
        },
      } as never),
    });
    return { address: account.address, walletClient };
  }

  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!eth) {
    throw new Error(
      "No wallet extension detected. Install MetaMask or Rabby, then reload.",
    );
  }
  const walletClient = createWalletClient({ transport: custom(eth as never) });
  const [address] = await walletClient.requestAddresses();
  if (!address) throw new Error("Wallet connection was rejected.");
  return { address, walletClient: createWalletClient({ account: address, transport: custom(eth as never) }) };
}

function exchangeClient(w: ConnectedWallet): InstanceType<typeof hl.ExchangeClient> {
  return new hl.ExchangeClient({
    transport,
    wallet: w.walletClient as never,
    isTestnet: !IS_MAINNET,
  });
}

/** Approved cap for our builder, in tenths of a bp. 0 = not approved. */
export async function approvedBuilderFee(user: `0x${string}`): Promise<number> {
  try {
    return await infoClient.maxBuilderFee({ user, builder: BUILDER_ADDRESS });
  } catch {
    return 0;
  }
}

export async function approveBuilder(w: ConnectedWallet): Promise<void> {
  await exchangeClient(w).approveBuilderFee({
    maxFeeRate: APPROVAL_MAX_FEE_RATE,
    builder: BUILDER_ADDRESS,
  });
}

export interface FillResult {
  totalSz: string;
  avgPx: string;
  oid: number;
  restingOnly: boolean;
  /** Entry filled but TP/SL legs were rejected — position has NO protection. */
  nakedPosition?: boolean;
  bracketError?: string;
}

export async function setLeverage(
  w: ConnectedWallet,
  assetIndex: number,
  leverage: number,
  isCross: boolean,
): Promise<void> {
  await exchangeClient(w).updateLeverage({ asset: assetIndex, isCross, leverage });
}

/** Marketable-limit IOC with our builder code attached.
 * With tpPct/slPct: entry + TP + SL in one grouped action (normalTpsl).
 * VERIFIED CAVEAT (testnet probes): grouping is NOT atomic — the entry can
 * fill while trigger legs reject (e.g. oracle price-band). We detect that and
 * report nakedPosition so the UI can offer an immediate close. */
export async function executeTrade(
  w: ConnectedWallet,
  asset: AssetInfo,
  coin: string,
  isBuy: boolean,
  usdNotional: number,
  tpPct?: number,
  slPct?: number,
): Promise<FillResult> {
  const posSzi = async () => {
    const st = await infoClient.clearinghouseState({ user: w.address });
    const ap = st.assetPositions.find((x) => x.position.coin === coin);
    return ap ? Number(ap.position.szi) : 0;
  };
  const preSzi = tpPct || slPct ? await posSzi() : 0;
  const rawPx = isBuy ? asset.mid * (1 + SLIPPAGE) : asset.mid * (1 - SLIPPAGE);
  const p = roundPrice(rawPx, asset.szDecimals);
  const s = roundSize(usdNotional / asset.mid, asset.szDecimals);
  if (Number(s) <= 0) throw new Error("Order size rounds to zero for this asset.");

  const orders: Parameters<ReturnType<typeof exchangeClient>["order"]>[0]["orders"][number][] = [
    { a: asset.index, b: isBuy, p, s, r: false, t: { limit: { tif: "Ioc" } } },
  ];
  const dir = isBuy ? 1 : -1;
  if (tpPct) {
    const trig = roundPrice(asset.mid * (1 + (dir * tpPct) / 100), asset.szDecimals);
    orders.push({ a: asset.index, b: !isBuy, p: trig, s, r: true, t: { trigger: { isMarket: true, triggerPx: trig, tpsl: "tp" } } });
  }
  if (slPct) {
    const trig = roundPrice(asset.mid * (1 - (dir * slPct) / 100), asset.szDecimals);
    orders.push({ a: asset.index, b: !isBuy, p: trig, s, r: true, t: { trigger: { isMarket: true, triggerPx: trig, tpsl: "sl" } } });
  }

  let res;
  try {
    res = await exchangeClient(w).order({
      orders,
      grouping: orders.length > 1 ? "normalTpsl" : "na",
      builder: { b: BUILDER_ADDRESS, f: BUILDER_FEE_TENTHS_BP },
    });
  } catch (e) {
    // Non-atomicity guard (verified on testnet): the entry can fill while
    // trigger legs reject. Compare this coin's position before vs after.
    if (orders.length > 1) {
      const postSzi = await posSzi();
      const delta = postSzi - preSzi;
      if ((isBuy && delta > 0) || (!isBuy && delta < 0)) {
        return {
          totalSz: Math.abs(delta).toFixed(asset.szDecimals),
          avgPx: "-",
          oid: 0,
          restingOnly: false,
          nakedPosition: true,
          bracketError: e instanceof Error ? e.message : String(e),
        };
      }
    }
    throw e;
  }

  const status = res.response.data.statuses[0];
  if (status && "filled" in status) {
    return {
      totalSz: status.filled.totalSz,
      avgPx: status.filled.avgPx,
      oid: status.filled.oid,
      restingOnly: false,
    };
  }
  if (status && "resting" in status) {
    return { totalSz: "0", avgPx: "-", oid: status.resting.oid, restingOnly: true };
  }
  throw new Error("Order was not filled (IOC expired without a match).");
}

/** Emergency close: reduce-only IOC for the user's whole position in this asset. */
export async function closePosition(w: ConnectedWallet, asset: AssetInfo, coin: string): Promise<FillResult> {
  const st = await infoClient.clearinghouseState({ user: w.address });
  const pos = st.assetPositions.find((ap) => ap.position.coin === coin);
  if (!pos || Number(pos.position.szi) === 0) throw new Error("No open position to close.");
  const szi = Number(pos.position.szi);
  const isBuy = szi < 0;
  const p = roundPrice(isBuy ? asset.mid * (1 + SLIPPAGE) : asset.mid * (1 - SLIPPAGE), asset.szDecimals);
  const res = await exchangeClient(w).order({
    orders: [{ a: asset.index, b: isBuy, p, s: Math.abs(szi).toFixed(asset.szDecimals), r: true, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
    builder: { b: BUILDER_ADDRESS, f: BUILDER_FEE_TENTHS_BP },
  });
  const status = res.response.data.statuses[0];
  if (status && "filled" in status) return { totalSz: status.filled.totalSz, avgPx: status.filled.avgPx, oid: status.filled.oid, restingOnly: false };
  throw new Error("Close order did not fill — manage the position on Hyperliquid directly.");
}

/** Human-readable order preview shown ABOVE the sign button (§ trust design). */
export function orderPreview(asset: AssetInfo, coin: string, isBuy: boolean, usdNotional: number) {
  const rawPx = isBuy ? asset.mid * (1 + SLIPPAGE) : asset.mid * (1 - SLIPPAGE);
  return {
    coin,
    side: isBuy ? "LONG / BUY" : "SHORT / SELL",
    size: `${roundSize(usdNotional / asset.mid, asset.szDecimals)} ${coin} (≈ $${usdNotional.toLocaleString()})`,
    limitPrice: roundPrice(rawPx, asset.szDecimals),
    mid: asset.mid,
    tif: "IOC (fills now or cancels — never rests hidden)",
    builderFeeBps: BUILDER_FEE_TENTHS_BP / 10,
  };
}
