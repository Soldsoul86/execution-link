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
import Landing from "./Landing";
import { resolveVariant, VARIANTS } from "./variants";
import { track } from "./track";
import {
  approveBuilder,
  approvedBuilderFee,
  closePosition,
  connectWallet,
  executeTrade,
  getAssetInfo,
  getPosition,
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
  const tParam = params.get("t");
  const trade = getTrade(tParam);
  // "See your name on it" preview: display-only, DEMO cards only, watermarked.
  const asHandle = trade?.id.startsWith("demo-") ? params.get("as") : null;
  const displayHandle = asHandle || trade?.kolHandle;
  const variant = useMemo(() => VARIANTS[resolveVariant()], []);
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [needsApproval, setNeedsApproval] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>({ k: "idle" });
  const [usd, setUsd] = useState<number>(trade?.usdDefault ?? 0);
  const [posSzi, setPosSzi] = useState<number | null>(null);
  const clampedUsd = trade
    ? Math.min(Math.max(usd || trade.usdMin, trade.usdMin), trade.usdMax)
    : 0;

  useEffect(() => {
    if (!trade) return;
    track("page_view", { tradeId: trade.id, variant: variant.id });
    getAssetInfo(trade.coin).then(setAsset, (e: Error) => setAssetError(e.message));
  }, []);

  if (!tParam) return <Landing />;
  if (!trade) {
    return (
      <main className="card">
        <h1>Unknown trade link</h1>
        <p>
          This page only executes trades from its built-in registry. The link you
          followed does not match any registered trade.
        </p>
        <p><a href="./">About these links</a></p>
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
      if (trade!.closeOnly) setPosSzi(await getPosition(w.address, trade!.coin));
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
      const fill = await executeTrade(wallet, asset, trade!.coin, trade!.isBuy, clampedUsd, trade!.tpPct, trade!.slPct, trade!.id, trade!.kolId);
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
  const hasProvider = typeof (window as unknown as { ethereum?: unknown }).ethereum !== "undefined"
    || (import.meta.env.DEV && !!import.meta.env.VITE_TEST_KEY);
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

  return (
    <main className="card">
      {!IS_MAINNET && <div className="banner">TESTNET — no real funds involved</div>}

      <header>
        {displayHandle && (variant.showKolShare || asHandle) && (
          <p className="kol">
            Trade created by {displayHandle}
            {asHandle && <span className="preview-badge">PREVIEW — not a real endorsement</span>}
          </p>
        )}
        <h1>
          {trade.closeOnly
            ? `EXIT: close ${trade.coin}-PERP position`
            : `${trade.coin}-PERP · ${trade.isBuy ? "LONG" : "SHORT"}`}
        </h1>
        <p className="venue">Venue: {NETWORK_LABEL}</p>
        {trade.note && <p className="note">{trade.note}</p>}
      </header>

      {assetError && <p className="error">Market data unavailable: {assetError}</p>}

      {trade.closeOnly && wallet && (
        <section className="preview" aria-label="Position to close">
          <h2>Your position</h2>
          {posSzi === null && <p>Loading…</p>}
          {posSzi === 0 && <p>No open {trade.coin} position on this account — nothing to close.</p>}
          {posSzi !== null && posSzi !== 0 && (
            <dl>
              <dt>Position</dt>
              <dd>{posSzi > 0 ? "LONG" : "SHORT"} {Math.abs(posSzi)} {trade.coin}</dd>
              <dt>Action</dt>
              <dd>Reduce-only close (cannot open or increase any position)</dd>
            </dl>
          )}
        </section>
      )}

      {!trade.closeOnly && preview && (
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
            {trade.tpPct && (
              <><dt>Take profit</dt><dd>{trade.isBuy ? "+" : "-"}{trade.tpPct}% from entry (auto-placed with the trade)</dd></>
            )}
            {trade.slPct && (
              <><dt>Stop loss</dt><dd>{trade.isBuy ? "-" : "+"}{trade.slPct}% from entry (auto-placed with the trade)</dd></>
            )}
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
            {(variant.showKolShare || asHandle) && displayHandle && (
              <>
                <dt>{displayHandle}'s share</dt>
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
        {!wallet && !hasProvider && isMobile && (
          <>
            <a
              className="btn primary block"
              href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`}
            >
              Open in MetaMask app
            </a>
            <p className="muted center">
              On mobile, wallets live in their own apps — this button reopens this exact
              page inside MetaMask's browser so you can sign safely. (Rabby/other wallet
              apps: paste this page's link into the wallet's built-in browser.)
            </p>
          </>
        )}
        {!wallet && (hasProvider || !isMobile) && (
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
        {wallet && needsApproval === false && step.k !== "filled" && !trade.closeOnly && (
          <button className="execute" onClick={onExecute} disabled={busy}>
            {step.k === "executing" ? "Executing…" : "Sign & execute this trade"}
          </button>
        )}
        {wallet && needsApproval === false && step.k !== "filled" && trade.closeOnly && (
          <button
            className="execute"
            disabled={busy || !posSzi}
            onClick={async () => {
              if (!wallet || !asset) return;
              setStep({ k: "executing" });
              track("order_submitted", { tradeId: trade!.id, variant: variant.id, address: wallet.address, detail: "exit" });
              try {
                const fill = await closePosition(wallet, asset, trade!.coin, trade!.id, trade!.kolId);
                setStep({ k: "filled", fill });
                track("order_filled", { tradeId: trade!.id, variant: variant.id, address: wallet.address, detail: `exit sz=${fill.totalSz}` });
              } catch (e) {
                fail(e);
                track("order_failed", { tradeId: trade!.id, variant: variant.id, address: wallet?.address, detail: String(e) });
              }
            }}
          >
            {step.k === "executing" ? "Closing…" : "Sign & close my position"}
          </button>
        )}
      </section>

      {step.k === "filled" && step.fill.nakedPosition && (
        <section className="result error">
          <h2>⚠ Position opened WITHOUT stop-loss protection</h2>
          <p>
            Your entry filled ({step.fill.totalSz} {trade.coin}), but the venue rejected the
            take-profit/stop-loss legs ({step.fill.bracketError}). Your position is currently
            unprotected.
          </p>
          <button
            className="execute"
            onClick={async () => {
              if (!wallet || !asset) return;
              try {
                await closePosition(wallet, asset, trade!.coin, trade!.id, trade!.kolId);
                setStep({ k: "error", message: "Position closed. Nothing remains open." });
              } catch (e) {
                fail(e);
              }
            }}
          >
            Close this position now
          </button>
          <p>
            Or manage it yourself on{" "}
            <a href={`${HL_APP_URL}/trade`} target="_blank" rel="noreferrer">Hyperliquid</a>.
          </p>
        </section>
      )}

      {step.k === "filled" && !step.fill.nakedPosition && (
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
