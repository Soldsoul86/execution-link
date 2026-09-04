# What happens when you click a trade link (2-minute read)

*(Hindi version: TODO — translate after copy freeze.)*

## The one-sentence version
Your KOL shares the trade they're taking; you connect **your own wallet**, see every
detail and every fee, and sign the trade **into your own Hyperliquid account** —
we never touch your money, and neither does your KOL.

## What you'll see, step by step
1. **The trade card** — market, direction, the KOL's take-profit and stop-loss,
   and every fee (Hyperliquid's fee, our fee, and your KOL's share of our fee —
   all shown before you do anything).
2. **You pick your own size** — the KOL sets the idea; the amount is yours.
3. **Connect wallet** — MetaMask/Rabby. We never see your keys.
4. **One-time approval** (first visit only) — a gasless signature that lets
   Hyperliquid pay us our small fee on trades you route through us. Your wallet
   shows the exact fee cap (0.05% max). You can revoke it anytime at
   Hyperliquid's builder page.
5. **Sign the trade** — one signature. The entry, take-profit and stop-loss go
   in together: you copy the KOL's whole plan, not just the entry.
6. **Verify it yourself** — open app.hyperliquid.xyz with the same wallet;
   your position is there. Never trust our page alone; check the venue.

## Where is my money, exactly?
In **your** Hyperliquid account, controlled by **your** wallet. Not with us,
not with your KOL. We cannot withdraw — the approval you sign is a fee cap,
not access to funds.

## What we and your KOL earn (full disclosure)
We charge 4 bps (0.04%) on trades executed through the link. Your KOL receives
50% of that. This is disclosed on every card because you deserve to know who
earns what. If you'd rather trade directly on Hyperliquid without our fee —
you always can; the venue is not ours.

## Honest limitations
- Hyperliquid wallet prompts show a cryptographic digest for orders, not the
  order fields. The full order is displayed on our page; the page is
  open-source (link in the footer) and runs entirely in your browser.
- Perp trading is high-risk. A stop-loss reduces risk; it does not remove it.
  Markets gap; stops can fill worse than their trigger.
- **Risk disclaimer**: Crypto products and NFTs are unregulated and can be
  highly risky. There may be no regulatory recourse for any loss from such
  transactions. This is not investment advice. Your KOL is not a registered
  investment adviser.

## Your exit doors (always open)
- Revoke our fee approval: Hyperliquid app → Builder Codes → set to 0%.
- Close any position directly on Hyperliquid, anytime.
- Stop using the links. Nothing persists except approvals you control.
