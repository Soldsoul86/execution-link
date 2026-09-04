// Optional Cloudflare Worker for EXP-010 funnel beacons.
// Stores stage events in KV (bind a namespace as FUNNEL). No IP, no UA stored.
// Deploy:  wrangler deploy worker/funnel-worker.js  (add KV binding first)
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok", { status: 200 });
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("bad request", { status: 400 });
    }
    const { stage, ts, tradeId, variant, address, detail } = body ?? {};
    if (typeof stage !== "string" || typeof tradeId !== "string") {
      return new Response("bad request", { status: 400 });
    }
    const key = `${ts ?? Date.now()}:${crypto.randomUUID()}`;
    const record = JSON.stringify({ stage, ts, tradeId, variant, address, detail });
    await env.FUNNEL.put(key, record);
    return new Response("ok", {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  },
};
