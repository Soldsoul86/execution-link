// Funnel beacons (EXP-010 §8). Pre-registered stages only. No cookies, no IP
// retention server-side (see worker/funnel-worker.js). Payload = stage + trade
// + variant + wallet address (public-chain pseudonym, needed to join funnel
// stages to on-chain fills). Beacons disabled when FUNNEL_ENDPOINT is empty.

import { FUNNEL_ENDPOINT } from "./config";

export type FunnelStage =
  | "page_view"
  | "wallet_connected"
  | "approval_signed"
  | "order_submitted"
  | "order_filled"
  | "order_failed";

export function track(
  stage: FunnelStage,
  data: { tradeId: string; variant: string; address?: string; detail?: string },
): void {
  const payload = JSON.stringify({ stage, ts: Date.now(), ...data });
  // Console mirror so the operator can always audit exactly what is sent.
  console.info("[funnel]", payload);
  if (!FUNNEL_ENDPOINT) return;
  try {
    navigator.sendBeacon(FUNNEL_ENDPOINT, payload);
  } catch {
    // Beacons must never break the flow.
  }
}
