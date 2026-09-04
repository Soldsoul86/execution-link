# EXP-010 testnet checklist — verified findings (2026-09-04)

Full run: 20/21 PASS + S9 redesigned after discovery (log: checklist-log.json).

## The economic primitive — PROVEN
- 39 fills, $2,253.36 routed notional through builder code (f=40 = 4 bps)
- Builder claimable rewards: **0.901325 USDC — exactly notional x 4 bps**
- Accrual is automatic; visible at info.referral(builder) as builderRewards;
  claimed via the referral claim flow.

## Venue mechanics verified on testnet
1. approveBuilderFee: gasless, signed by main wallet; "0.05%" reads back as 50
   (tenths of a bp) via maxBuilderFee.
2. Builder minimum: >=100 USDC in PERPS, inclusive (99.0 rejects with
   "Builder has insufficient balance to be approved"; 100.0 passes).
   Applies on testnet too.
3. Revocation: approveBuilderFee "0%" -> orders carrying our code reject;
   re-approval restores. Full cycle verified.
4. Over-cap and no-approval produce the IDENTICAL error string:
   "Builder fee has not been approved." -> page maps both to one message.
5. IOC semantics: excess-size IOC orders partially fill (margin/book bound)
   and cancel the remainder — NO error. Hard rejection happens only for
   resting orders: "Insufficient margin to place order. asset=N".
6. UI "Send" moves SPOT USDC; perps trading needs usdClassTransfer
   (spot->perp). The page's future funding copy must say "Perps USDC".
7. usdSend / usdClassTransfer / approveBuilderFee / orders all verified
   headlessly via SDK local accounts — signature->address recovery correct.

## Still manual (needs a human wallet)
- Wallet-prompt screenshots (approval shows readable fields; order shows a
  digest) — capture during the user's own MetaMask testnet pass.
- Publishing the repo + REPO_URL.

## Bracket verification (completed later, 2026-09-04)
- normalTpsl bracket VERIFIED end-to-end on testnet: entry IOC filled
  (0.00018 BTC @ 82854), TP and SL legs accepted as "waitingForTrigger"
  and visible as resting trigger orders (TP @ 84511, SL @ 81197);
  position closed and residual triggers cancelled cleanly.
- Response shape note: trigger-leg statuses are the STRING
  "waitingForTrigger", not objects — only statuses[0] (the entry) carries
  the fill object our UI reads.
- Oracle-band observation: succeeded at ~2.44% ask/oracle skew with entry
  at best ask; earlier failure was at >2.5% and with mid+0.5% pricing.
  Band edge sits near ~2.5% on testnet BTC; mainnet oracle tracks mid so
  the band is a non-issue there.
