// EXP-010 configuration. All network-affecting values live here.
// SAFETY: testnet is the default. Mainnet requires an explicit env flag at build time.

export const IS_MAINNET = import.meta.env.VITE_HL_MAINNET === "true";

// The builder address collecting fees. MUST hold >=100 USDC in its HL perps
// account (mainnet) before mainnet launch. Set per environment.
export const BUILDER_ADDRESS = (import.meta.env.VITE_BUILDER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// Fee actually attached to orders, in tenths of a basis point (f=40 -> 4 bps).
export const BUILDER_FEE_TENTHS_BP = 40;

// Approval cap requested from the user, as a percent string for approveBuilderFee.
// 0.05% = 5 bps. Orders above the user's approved cap are rejected by the venue.
export const APPROVAL_MAX_FEE_RATE = "0.05%";

// Marketable-limit slippage applied to mid for "market" execution.
export const SLIPPAGE = 0.005; // 0.5%

// Funnel beacon endpoint (optional). Empty string disables network beacons.
export const FUNNEL_ENDPOINT = import.meta.env.VITE_FUNNEL_ENDPOINT ?? "";

export const HL_APP_URL = IS_MAINNET
  ? "https://app.hyperliquid.xyz"
  : "https://app.hyperliquid-testnet.xyz";

export const REPO_URL = "https://github.com/REPLACE_ME/exp010"; // set after publishing

export const NETWORK_LABEL = IS_MAINNET ? "Hyperliquid" : "Hyperliquid TESTNET";
