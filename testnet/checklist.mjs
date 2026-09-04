// EXP-010 testnet checklist harness (README items 2-4, automated portion).
// Uses throwaway LOCAL test keys (generated on first run, gitignored).
// TESTNET ONLY — hardcoded. Never point this at mainnet.
//
// Steps map to BUILDER_TRANSACTION_EXPERIMENT.md §13:
//   S1 connectivity/meta  S2 account status  S3 builder-fee approval
//   S4 approved-cap readback  S5 order (happy path)  S6 fee-cap rejection
//   S7 revocation end-to-end  S8 five full cycles  S9 deliberate margin failure
// Each step logs PASS / FAIL / BLOCKED_FUNDING with raw API responses.

import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KEYS_FILE = path.join(DIR, ".keys.json");
const LOG_FILE = path.join(DIR, "checklist-log.json");

const BUILDER_FEE_F = 40; // 4 bps, matches src/config.ts
const APPROVAL_RATE = "0.05%"; // cap 5 bps => maxBuilderFee readback expected 50

function loadOrCreateKeys() {
  if (fs.existsSync(KEYS_FILE)) return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  const keys = { trader: generatePrivateKey(), builder: generatePrivateKey() };
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
  return keys;
}

const keys = loadOrCreateKeys();
const trader = privateKeyToAccount(keys.trader);
const builder = privateKeyToAccount(keys.builder);

const transport = new hl.HttpTransport({ isTestnet: true });
const info = new hl.InfoClient({ transport });
const exch = new hl.ExchangeClient({ transport, wallet: trader, isTestnet: true });

const log = [];
function record(step, status, detail) {
  const entry = { step, status, detail, ts: new Date().toISOString() };
  log.push(entry);
  console.log(`[${status}] ${step}${detail ? " — " + JSON.stringify(detail).slice(0, 300) : ""}`);
}
function errMsg(e) {
  return (e && (e.message ?? String(e))).slice(0, 400);
}
function isFundingError(msg) {
  return /does not exist|deposit|insufficient|must have|no balance|account value/i.test(msg);
}

async function step(name, fn, { fundingOk = false } = {}) {
  try {
    const detail = await fn();
    record(name, "PASS", detail);
    return { ok: true, detail };
  } catch (e) {
    const msg = errMsg(e);
    if (fundingOk && isFundingError(msg)) {
      record(name, "BLOCKED_FUNDING", { error: msg });
      return { ok: false, blocked: true, msg };
    }
    record(name, "FAIL", { error: msg });
    return { ok: false, msg };
  }
}

async function expectReject(name, fn, pattern) {
  try {
    const res = await fn();
    record(name, "FAIL", { unexpectedSuccess: res });
    return { ok: false };
  } catch (e) {
    const msg = errMsg(e);
    const matched = pattern.test(msg);
    if (!matched && isFundingError(msg)) {
      record(name, "BLOCKED_FUNDING", { error: msg });
      return { ok: false, blocked: true };
    }
    record(name, matched ? "PASS" : "FAIL", { rejectedWith: msg, expectedPattern: String(pattern) });
    return { ok: matched };
  }
}

function round(px, szDecimals) {
  const maxDec = Math.max(0, 6 - szDecimals);
  return Number(Number(px.toPrecision(5)).toFixed(maxDec)).toString();
}

async function marketableOrder({ f = BUILDER_FEE_F, usd = 12, buy = true, reduceOnly = false }) {
  const [meta, mids] = await Promise.all([info.meta(), info.allMids()]);
  const idx = meta.universe.findIndex((u) => u.name === "BTC");
  const szDec = meta.universe[idx].szDecimals;
  const mid = Number(mids["BTC"]);
  const p = round(buy ? mid * 1.005 : mid * 0.995, szDec);
  const s = Math.max(usd / mid, 10 ** -szDec).toFixed(szDec);
  return exch.order({
    orders: [{ a: idx, b: buy, p, s, r: reduceOnly, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
    builder: { b: builder.address, f },
  });
}

console.log("EXP-010 testnet checklist");
console.log("trader  address:", trader.address);
console.log("builder address:", builder.address);
console.log("network: TESTNET (hardcoded)\n");

// S1 — connectivity + market data
await step("S1 connectivity: meta + mids", async () => {
  const [meta, mids] = await Promise.all([info.meta(), info.allMids()]);
  const btc = meta.universe.find((u) => u.name === "BTC");
  if (!btc) throw new Error("BTC missing from universe");
  return { assets: meta.universe.length, btcMid: mids["BTC"], szDecimals: btc.szDecimals };
});

// S2 — account funding status (informational)
await step("S2 trader account state", async () => {
  const st = await info.clearinghouseState({ user: trader.address });
  return { accountValue: st.marginSummary?.accountValue ?? "0" };
});
await step("S2b builder account state", async () => {
  const st = await info.clearinghouseState({ user: builder.address });
  return { accountValue: st.marginSummary?.accountValue ?? "0" };
});

// S3 — builder-fee approval (gasless user-signed action)
const s3 = await step(
  "S3 approveBuilderFee 0.05%",
  async () => exch.approveBuilderFee({ maxFeeRate: APPROVAL_RATE, builder: builder.address }),
  { fundingOk: true },
);

// S4 — approved-cap readback
if (s3.ok) {
  await step("S4 maxBuilderFee readback == 50 (tenths of bp)", async () => {
    const v = await info.maxBuilderFee({ user: trader.address, builder: builder.address });
    if (v !== 50) throw new Error(`expected 50, got ${v}`);
    return { approved: v };
  });
}

// S5 — happy-path order (needs margin)
const s5 = await step("S5 order BTC $12 IOC with f=40", () => marketableOrder({}), { fundingOk: true });

// S6 — fee above approved cap must reject (f=60 > 50)
await expectReject("S6 fee-cap rejection (f=60 > approved 50)", () => marketableOrder({ f: 60 }), /builder fee|not.*approved|exceed/i);

// S7 — revocation end-to-end: set 0%, order must reject, then re-approve
if (s3.ok) {
  await step("S7a revoke (approveBuilderFee 0%)", () =>
    exch.approveBuilderFee({ maxFeeRate: "0%", builder: builder.address }));
  await expectReject("S7b order after revocation rejects", () => marketableOrder({}), /builder fee|not.*approved|exceed/i);
  await step("S7c re-approve 0.05%", () =>
    exch.approveBuilderFee({ maxFeeRate: APPROVAL_RATE, builder: builder.address }));
}

// S8 — five full cycles (open + reduce), only meaningful once funded
if (s5.ok) {
  for (let i = 1; i <= 5; i++) {
    await step(`S8 cycle ${i}/5 open`, () => marketableOrder({ buy: true }));
    await step(`S8 cycle ${i}/5 close`, () => marketableOrder({ buy: false, reduceOnly: true }));
  }
  // S9 — deliberate failure. VERIFIED SEMANTICS (2026-09-04): IOC orders do NOT
  // hard-reject on excess size — they fill what margin/book allows and cancel
  // the rest. Hard rejection ("Insufficient margin to place order") only
  // occurs for orders that would REST beyond margin. So the test uses GTC.
  await exch.updateLeverage({ asset: (await info.meta()).universe.findIndex(u => u.name === "BTC"), isCross: true, leverage: 1 });
  await expectReject("S9 deliberate margin failure (GTC $5k at 1x)", async () => {
    const [meta, mids] = await Promise.all([info.meta(), info.allMids()]);
    const idx = meta.universe.findIndex((u) => u.name === "BTC");
    const szDec = meta.universe[idx].szDecimals;
    const mid = Number(mids["BTC"]);
    const p = round(mid * 0.8, szDec);
    return exch.order({
      orders: [{ a: idx, b: true, p, s: (5000 / (mid * 0.8)).toFixed(szDec), r: false, t: { limit: { tif: "Gtc" } } }],
      grouping: "na",
      builder: { b: builder.address, f: BUILDER_FEE_F },
    });
  }, /insufficient margin/i);
} else {
  record("S8 five cycles", "BLOCKED_FUNDING", { need: "testnet USDC on trader address" });
  record("S9 deliberate margin failure", "BLOCKED_FUNDING", { need: "testnet USDC on trader address" });
}

fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
const counts = log.reduce((m, e) => ((m[e.status] = (m[e.status] ?? 0) + 1), m), {});
console.log("\nSummary:", counts);
console.log("Log written to", LOG_FILE);
if (counts.BLOCKED_FUNDING) {
  console.log(`\nTO UNBLOCK: send testnet USDC to trader ${trader.address}`);
  console.log(`(faucet: https://app.hyperliquid-testnet.xyz/drip — needs a browser wallet)`);
  console.log(`and ~100 testnet USDC to builder ${builder.address} (fee accrual check).`);
}
