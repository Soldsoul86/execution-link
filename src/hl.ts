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
}

export async function setLeverage(
  w: ConnectedWallet,
  assetIndex: number,
  leverage: number,
  isCross: boolean,
): Promise<void> {
  await exchangeClient(w).updateLeverage({ asset: assetIndex, isCross, leverage });
}

/** Marketable-limit IOC with our builder code attached. */
export async function executeTrade(
  w: ConnectedWallet,
  asset: AssetInfo,
  isBuy: boolean,
  usdNotional: number,
): Promise<FillResult> {
  const rawPx = isBuy ? asset.mid * (1 + SLIPPAGE) : asset.mid * (1 - SLIPPAGE);
  const p = roundPrice(rawPx, asset.szDecimals);
  const s = roundSize(usdNotional / asset.mid, asset.szDecimals);
  if (Number(s) <= 0) throw new Error("Order size rounds to zero for this asset.");

  const res = await exchangeClient(w).order({
    orders: [
      { a: asset.index, b: isBuy, p, s, r: false, t: { limit: { tif: "Ioc" } } },
    ],
    grouping: "na",
    builder: { b: BUILDER_ADDRESS, f: BUILDER_FEE_TENTHS_BP },
  });

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
