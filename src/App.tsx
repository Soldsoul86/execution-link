import { useEffect, useMemo, useState } from "react";
import {
  BUILDER_ADDRESS,
  BUILDER_FEE_TENTHS_BP,
  HL_APP_URL,
  IS_MAINNET,
  NETWORK_LABEL,
  REPO_URL,
} from "./config";
import { getTrade } from "./trades";
import { resolveVariant, VARIANTS } from "./variants";
import { track } from "./track";
import {
  approveBuilder,
  approvedBuilderFee,
  connectWallet,
  executeTrade,
  getAssetInfo,
  orderPreview,
  setLeverage,
  type AssetInfo,
  type ConnectedWallet,
  type FillResult,
} from "./hl";

type Step =
  | { k: "idle" }
  | { k: "connecting" }
  | { k: "connected" }
  | { k: "approving" }
  | { k: "executing" }
  | { k: "filled"; fill: FillResult }
  | { k: "error"; message: string };

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const trade = getTrade(params.get("t"));
  const variant = useMemo(() => VARIANTS[resolveVariant()], []);
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [needsApproval, setNeedsApproval] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>({ k: "idle" });
  const [usd, setUsd] = useState<number>(trade?.usdDefault ?? 0);
  const clampedUsd = trade
    ? Math.min(Math.max(usd || trade.usdMin, trade.usdMin), trade.usdMax)
    : 0;

  useEffect(() => {
    if (!trade) return;
    track("page_view", { tradeId: trade.id, variant: variant.id });
    getAssetInfo(trade.coin).then(setAsset, (e: Error) => setAssetError(e.message));
  }, []);

  if (!trade) {
    return (
      <main className="card">
        <h1>Unknown trade link</h1>
        <p>
          This page only executes trades from its built-in registry. The link you
          followed does not match any registered trade.
        </p>
      </main>
    );
  }

  const preview = asset ? orderPreview(asset, trade.coin, trade.isBuy, clampedUsd) : null;

  async function onConnect() {
    setStep({ k: "connecting" });
    try {
      const w = await connectWallet();
      setWallet(w);
      const approved = await approvedBuilderFee(w.address);
      setNeedsApproval(approved < BUILDER_FEE_TENTHS_BP);
      setStep({ k: "connected" });
      track("wallet_connected", { tradeId: trade!.id, variant: variant.id, address: w.address });
    } catch (e) {
      fail(e);
    }
  }

  async function onApprove() {
    if (!wallet) return;
    setStep({ k: "approving" });
    try {
      await approveBuilder(wallet);
      setNeedsApproval(false);
      setStep({ k: "connected" });
      track("approval_signed", { tradeId: trade!.id, variant: variant.id, address: wallet.address });
    } catch (e) {
      fail(e);
    }
  }

  async function onExecute() {
    if (!wallet || !asset) return;
    setStep({ k: "executing" });
    track("order_submitted", { tradeId: trade!.id, variant: variant.id, address: wallet.address });
    try {
      if (trade!.leverage) {
        await setLeverage(wallet, asset.index, trade!.leverage, trade!.isCross ?? true);
      }
      const fill = await executeTrade(wallet, asset, trade!.isBuy, clampedUsd);
      setStep({ k: "filled", fill });
      track("order_filled", {
        tradeId: trade!.id,
        variant: variant.id,
        address: wallet.address,
        detail: `sz=${fill.totalSz} px=${fill.avgPx}`,
      });
    } catch (e) {
      fail(e);
      track("order_failed", {
        tradeId: trade!.id,
        variant: variant.id,
        address: wallet?.address,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function fail(e: unknown) {
    setStep({ k: "error", message: e instanceof Error ? e.message : String(e) });
  }

  const busy = step.k === "connecting" || step.k === "approving" || step.k === "executing";

  return (
    <main className="card">
      {!IS_MAINNET && <div className="banner">TESTNET — no real funds involved</div>}

      <header>
        {trade.kolHandle && variant.showKolShare && (
          <p className="kol">Trade created by {trade.kolHandle}</p>
        )}
        <h1>
          {trade.coin}-PERP · {trade.isBuy ? "LONG" : "SHORT"}
        </h1>
        <p className="venue">Venue: {NETWORK_LABEL}</p>
        {trade.note && <p className="note">{trade.note}</p>}
      </header>

      {assetError && <p className="error">Market data unavailable: {assetError}</p>}

      {preview && (
        <section className="preview" aria-label="Exact order you will sign">
          <h2>The exact order you will sign</h2>
          <label className="sizerow">
            Your size (USD):{" "}
            <input
              type="number"
              min={trade.usdMin}
              max={trade.usdMax}
              step="1"
              value={usd}
              onChange={(e) => setUsd(Number(e.target.value))}
              disabled={busy || step.k === "filled"}
            />
            <span className="bounds">
              min ${trade.usdMin.toLocaleString()} · max ${trade.usdMax.toLocaleString()}
            </span>
          </label>
          <dl>
            <dt>Market</dt><dd>{preview.coin}-PERP</dd>
            <dt>Side</dt><dd>{preview.side}</dd>
            <dt>Size</dt><dd>{preview.size}</dd>
            <dt>Limit price (incl. 0.5% slippage guard)</dt><dd>{preview.limitPrice}</dd>
            <dt>Time in force</dt><dd>{preview.tif}</dd>
            {trade.leverage && (
              <><dt>Leverage</dt><dd>{trade.leverage}x ({trade.isCross ?? true ? "cross" : "isolated"})</dd></>
            )}
          </dl>
        </section>
      )}

      {variant.showFeeTable && (
        <section className="fees" aria-label="Fees">
          <h2>Every fee, upfront</h2>
          <dl>
            <dt>Venue trading fee</dt>
            <dd>up to 0.045% taker (less at higher tiers) — paid to Hyperliquid</dd>
            <dt>Our builder fee</dt>
            <dd>{BUILDER_FEE_TENTHS_BP / 10} bps ({(BUILDER_FEE_TENTHS_BP / 1000).toFixed(3)}%) — approval capped at 0.05%, revocable</dd>
            {variant.showKolShare && trade.kolHandle && (
              <>
                <dt>{trade.kolHandle}'s share</dt>
                <dd>50% of our builder fee — disclosed, not hidden</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {variant.lines.length > 0 && (
        <section className="trust">
          {variant.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </section>
      )}

      <section className="actions">
        {!wallet && (
          <button onClick={onConnect} disabled={busy || !asset}>
            {step.k === "connecting" ? "Connecting…" : "Connect wallet"}
          </button>
        )}
        {wallet && needsApproval === true && (
          <button onClick={onApprove} disabled={busy}>
            {step.k === "approving"
              ? "Waiting for wallet…"
              : "Approve builder fee (one-time, gasless, capped 0.05%)"}
          </button>
        )}
        {wallet && needsApproval === false && step.k !== "filled" && (
          <button className="execute" onClick={onExecute} disabled={busy}>
            {step.k === "executing" ? "Executing…" : "Sign & execute this trade"}
          </button>
        )}
      </section>

      {step.k === "filled" && (
        <section className="result">
          <h2>Filled ✓</h2>
          {step.fill.restingOnly ? (
            <p>
              Order rested instead of filling (oid {step.fill.oid}). Manage it on{" "}
              <a href={`${HL_APP_URL}/trade`} target="_blank" rel="noreferrer">Hyperliquid</a>.
            </p>
          ) : (
            <p>
              {step.fill.totalSz} {trade.coin} @ avg {step.fill.avgPx} (order {step.fill.oid}).
            </p>
          )}
          <p>
            Verify it yourself on{" "}
            <a href={`${HL_APP_URL}/trade`} target="_blank" rel="noreferrer">
              Hyperliquid's own app
            </a>{" "}
            — same wallet, same account, your position is there.
          </p>
        </section>
      )}

      {step.k === "error" && (
        <section className="result error">
          <h2>Not executed</h2>
          <p>{step.message}</p>
          <p>Nothing was charged. You can retry, or trade directly on Hyperliquid.</p>
        </section>
      )}

      <footer>
        <p>
          Builder address: <code>{BUILDER_ADDRESS}</code> · fee approval is revocable on{" "}
          <a href={`${HL_APP_URL}/builderCodes`} target="_blank" rel="noreferrer">
            Hyperliquid's builder page
          </a>
        </p>
        <p>
          This page is fully client-side —{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">read the source</a>. Your keys and
          orders never touch our server.
        </p>
      </footer>
    </main>
  );
}
