# EXP-010 — Execution Link (V1)

The smallest possible test of the builder-code primitive:
**click → connect your own wallet → sign → trade fills in YOUR Hyperliquid account → builder fee accrues automatically.**

Protocol, thresholds, and kill criteria: `~/BUILDER_TRANSACTION_EXPERIMENT.md` (pre-registered — do not edit after launch).
Architecture rationale: `~/HYPERLIQUID_DISTRIBUTION_DECISION.md`.

## What this is / is not
- Fully client-side: keys and orders never touch any server. The only optional network call besides Hyperliquid's API is an anonymous-ish funnel beacon (`worker/`).
- Registry-locked links: the page renders ONLY trades defined in `src/trades.ts`. URL tampering cannot change what a user signs.
- Non-custodial: per-order wallet signatures; the one-time builder-fee approval is gasless, wallet-readable, capped at 0.05%, and revocable at Hyperliquid's own builder page.
- NOT a terminal, dashboard, bot, or platform. On purpose.

## Run
```
npm install
cp .env.example .env.local   # set VITE_BUILDER_ADDRESS
npm run dev                  # testnet by default
```
Open `http://localhost:5173/?t=demo-btc-long&v=c`.

## Before mainnet (release-blocking, from EXP-010 §13)
1. Fund the builder address with ≥100 USDC in its Hyperliquid perps account.
2. Complete ≥5 full testnet cycles including one deliberate failure (insufficient margin) and one fee-cap rejection.
3. Capture wallet-prompt screenshots (approval + order) for the records.
4. Test revocation end-to-end (approve → revoke at app.hyperliquid.xyz/builderCodes → order rejects).
5. Publish this repo and set `REPO_URL` in `src/config.ts`.
6. Deploy the funnel worker (or accept console-only logging) and set `VITE_FUNNEL_ENDPOINT`.
7. Only then: `VITE_HL_MAINNET=true` and deploy (any static host).

## Adding a KOL trade
Add an entry to `src/trades.ts` with `kolId`/`kolHandle`, redeploy, share `/?t=<id>`.
Trust-copy variants: `?v=a|b|c|d` (sticky). Variant definitions in `src/variants.ts` — copy is audited against verified venue mechanics; do not edit casually.

## Honest limitations (tell users the truth)
- Hyperliquid order signatures show a cryptographic digest in the wallet, not order fields. Mitigations: full order preview on-page, open source, client-side only, and the fill is verifiable on Hyperliquid's own app seconds later.
- Funds sit in the user's own Hyperliquid account (not "in your wallet") — the copy says exactly that.
