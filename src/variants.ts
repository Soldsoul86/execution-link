// Trust-copy variants (EXP-010 §5). The FLOW is identical across variants —
// only the trust communication changes. Assignment: ?v=a|b|c|d wins, else a
// random sticky assignment stored in localStorage. Every claim here was
// audited against verified venue mechanics; do not edit copy without
// re-checking HYPERLIQUID_DISTRIBUTION_DECISION.md §6.

export type VariantId = "a" | "b" | "c" | "d";

export interface TrustCopy {
  id: VariantId;
  lines: string[];
  /** Whether to render the itemized fee table above the button. */
  showFeeTable: boolean;
  /** Whether to render KOL revenue-share disclosure (only if trade has a KOL). */
  showKolShare: boolean;
}

export const VARIANTS: Record<VariantId, TrustCopy> = {
  a: {
    id: "a",
    lines: [],
    showFeeTable: false,
    showKolShare: false,
  },
  b: {
    id: "b",
    lines: [
      "Your funds stay in your own Hyperliquid account. We never take custody and cannot withdraw.",
      "You sign every order yourself. Revoke our fee approval anytime.",
    ],
    showFeeTable: false,
    showKolShare: false,
  },
  c: {
    id: "c",
    lines: [
      "Your funds stay in your own Hyperliquid account. We never take custody and cannot withdraw — you sign every order yourself.",
      "Heads-up on wallet prompts: Hyperliquid order signatures display a cryptographic digest, not order fields. The full order is shown on this page, this page is open-source and fully client-side, and your position is verifiable on Hyperliquid's own app seconds after the fill.",
      "Our fee approval is capped and revocable anytime from Hyperliquid's builder-fee page.",
    ],
    showFeeTable: true,
    showKolShare: false,
  },
  d: {
    id: "d",
    lines: [
      "Your funds stay in your own Hyperliquid account. We never take custody and cannot withdraw — you sign every order yourself.",
    ],
    showFeeTable: true,
    showKolShare: true,
  },
};

const STORAGE_KEY = "exp010_variant";

export function resolveVariant(): VariantId {
  const q = new URLSearchParams(window.location.search).get("v");
  if (q === "a" || q === "b" || q === "c" || q === "d") {
    try {
      localStorage.setItem(STORAGE_KEY, q);
    } catch {
      /* storage unavailable — proceed */
    }
    return q;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "a" || saved === "b" || saved === "c" || saved === "d") return saved;
  } catch {
    /* ignore */
  }
  const pick = (["a", "b", "c", "d"] as const)[Math.floor(Math.random() * 4)];
  try {
    localStorage.setItem(STORAGE_KEY, pick);
  } catch {
    /* ignore */
  }
  return pick;
}
