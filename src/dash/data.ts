// Dashboard data layer. ONE event stream, many views (architecture decision:
// the chain is the event store; beacons only add pre-wallet funnel stages).
//
// Sources:
//  - On-chain: infoClient.userFills(address) filtered to OUR fills
//    (cloid magic match, or builderFee > 0 as fallback for untagged fills).
//  - Roster: local storage (fed by beacons later) + manual add + demo mode.

import { infoClient } from "../hl";
import { decodeCloid } from "../attribution";
import { TRADES } from "../trades";

export interface OurFill {
  address: string;
  coin: string;
  side: "B" | "A";
  px: number;
  sz: number;
  notional: number;
  time: number;
  closedPnl: number;
  builderFee: number;
  tradeId: string | null;
  kolId: string | null;
  dir: string;
}

export interface TraderStats {
  address: string;
  fills: number;
  volume: number;
  builderFees: number;
  realizedPnl: number;
  firstSeen: number;
  lastActive: number;
  calls: string[]; // distinct tradeIds followed
  openPositionCoins: string[];
  segments: Segment[];
}

export type Segment = "new" | "active" | "high-volume" | "dormant" | "losing" | "repeat";

export const SEGMENT_META: Record<Segment, { icon: string; label: string; action: string }> = {
  new: { icon: "🟢", label: "New trader", action: "Welcome them — link the follower guide" },
  active: { icon: "🔥", label: "Active trader", action: "Check in — share your next call" },
  "high-volume": { icon: "💰", label: "High-volume", action: "Send a personal update" },
  dormant: { icon: "💤", label: "Dormant", action: "Invite back with your latest call" },
  losing: { icon: "⚠️", label: "Losing heavily", action: "Check in — remind them of sizing/stops (no pressure)" },
  repeat: { icon: "⭐", label: "Repeat follower", action: "Invite to your community" },
};

const ROSTER_KEY = "exp010_roster";

export function getRoster(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ROSTER_KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function addToRoster(addr: string): string[] {
  const r = Array.from(new Set([...getRoster(), addr.toLowerCase()]));
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(r));
  } catch { /* ignore */ }
  return r;
}

const tradeIds = TRADES.map((t) => t.id);
const kolIds = Array.from(new Set(TRADES.map((t) => t.kolId).filter(Boolean)));

export async function fetchOurFills(address: string): Promise<OurFill[]> {
  const fills = (await infoClient.userFills({ user: address as `0x${string}` })) as unknown as Array<
    Record<string, unknown>
  >;
  const out: OurFill[] = [];
  for (const f of fills) {
    const cloid = f.cloid as string | undefined;
    const dec = decodeCloid(cloid, tradeIds, kolIds);
    const builderFee = Number((f as { builderFee?: string }).builderFee ?? 0);
    if (!dec.ours && !(builderFee > 0)) continue;
    const px = Number(f.px), sz = Number(f.sz);
    out.push({
      address: address.toLowerCase(),
      coin: String(f.coin),
      side: f.side as "B" | "A",
      px,
      sz,
      notional: px * sz,
      time: Number(f.time),
      closedPnl: Number(f.closedPnl ?? 0),
      builderFee,
      tradeId: dec.tradeId,
      kolId: dec.kolId,
      dir: String(f.dir ?? ""),
    });
  }
  return out;
}

export async function fetchOpenCoins(address: string): Promise<string[]> {
  const st = await infoClient.clearinghouseState({ user: address as `0x${string}` });
  return st.assetPositions.filter((p) => Number(p.position.szi) !== 0).map((p) => p.position.coin);
}

const DAY = 86_400_000;

export function computeTraderStats(address: string, fills: OurFill[], openCoins: string[], now = Date.now()): TraderStats {
  const volume = fills.reduce((a, f) => a + f.notional, 0);
  const realizedPnl = fills.reduce((a, f) => a + f.closedPnl, 0);
  const builderFees = fills.reduce((a, f) => a + f.builderFee, 0);
  const firstSeen = fills.length ? Math.min(...fills.map((f) => f.time)) : 0;
  const lastActive = fills.length ? Math.max(...fills.map((f) => f.time)) : 0;
  const calls = Array.from(new Set(fills.map((f) => f.tradeId).filter((x): x is string => !!x)));
  const segments: Segment[] = [];
  if (now - firstSeen < 7 * DAY) segments.push("new");
  if (now - lastActive < 7 * DAY && fills.length >= 2) segments.push("active");
  if (volume >= 100_000) segments.push("high-volume");
  if (lastActive && now - lastActive > 14 * DAY) segments.push("dormant");
  if (realizedPnl < -0.15 * Math.max(volume / 10, 1) && realizedPnl < -50) segments.push("losing");
  if (calls.length >= 2) segments.push("repeat");
  return { address, fills: fills.length, volume, builderFees, realizedPnl, firstSeen, lastActive, calls, openPositionCoins: openCoins, segments };
}

export interface CallStats {
  tradeId: string;
  executions: number;
  traders: number;
  volume: number;
  builderFees: number;
  openEntries: number;
  exits: number;
  realizedPnl: number;
  lastActivity: number;
}

export function computeCallStats(allFills: OurFill[]): CallStats[] {
  const byCall = new Map<string, OurFill[]>();
  for (const f of allFills) {
    const id = f.tradeId ?? "(untagged)";
    byCall.set(id, [...(byCall.get(id) ?? []), f]);
  }
  return Array.from(byCall.entries()).map(([tradeId, fs]) => ({
    tradeId,
    executions: fs.length,
    traders: new Set(fs.map((f) => f.address)).size,
    volume: fs.reduce((a, f) => a + f.notional, 0),
    builderFees: fs.reduce((a, f) => a + f.builderFee, 0),
    openEntries: fs.filter((f) => f.dir.startsWith("Open")).length,
    exits: fs.filter((f) => f.dir.startsWith("Close")).length,
    realizedPnl: fs.reduce((a, f) => a + f.closedPnl, 0),
    lastActivity: Math.max(...fs.map((f) => f.time)),
  })).sort((a, b) => b.lastActivity - a.lastActivity);
}

// ---------- demo mode ----------
export function demoData(): { traders: TraderStats[]; fills: OurFill[] } {
  const now = Date.now();
  const mk = (addr: string, arr: Array<Partial<OurFill>>): OurFill[] =>
    arr.map((p, i) => ({
      address: addr, coin: "BTC", side: "B", px: 82000, sz: 0.05, notional: 4100,
      time: now - (arr.length - i) * DAY, closedPnl: 0, builderFee: 1.64,
      tradeId: "demo-btc-long", kolId: "traderx", dir: "Open Long", ...p,
    }));
  const fills: OurFill[] = [
    ...mk("0xaaa1…9f21", [
      { notional: 250000, sz: 3.05, builderFee: 100, time: now - 26 * DAY },
      { notional: 250000, sz: 3.05, builderFee: 100, dir: "Close Long", closedPnl: 6100, time: now - 24 * DAY },
      { notional: 400000, sz: 4.8, builderFee: 160, tradeId: "demo-eth-short", coin: "ETH", time: now - 2 * DAY },
    ]),
    ...mk("0xbbb2…44c8", [
      { notional: 12000, sz: 0.15, builderFee: 4.8, time: now - 5 * DAY },
      { notional: 12000, sz: 0.15, builderFee: 4.8, dir: "Close Long", closedPnl: -310, time: now - 4 * DAY },
      { notional: 9000, sz: 0.11, builderFee: 3.6, time: now - 1 * DAY },
    ]),
    ...mk("0xccc3…07de", [{ notional: 5000, sz: 0.06, builderFee: 2, time: now - 2 * DAY }]),
    ...mk("0xddd4…b30a", [
      { notional: 60000, sz: 0.73, builderFee: 24, time: now - 40 * DAY },
      { notional: 61000, sz: 0.74, builderFee: 24.4, dir: "Close Long", closedPnl: -4200, time: now - 32 * DAY },
    ]),
  ];
  const byAddr = new Map<string, OurFill[]>();
  for (const f of fills) byAddr.set(f.address, [...(byAddr.get(f.address) ?? []), f]);
  const traders = Array.from(byAddr.entries()).map(([a, fs]) =>
    computeTraderStats(a, fs, a.endsWith("07de") ? ["BTC"] : [], now),
  );
  return { traders, fills };
}
