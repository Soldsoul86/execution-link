// On-chain attribution: every order we place carries a cloid (client order id)
// that encodes WHICH call and WHICH KOL produced it. Fills echo the cloid back
// via public APIs, so attribution needs no backend and works forever.
//
// cloid layout (16 bytes / 32 hex chars):
//   [0]    0xE0 magic
//   [1]    0x10 version
//   [2-7]  fnv48(tradeId)
//   [8-11] fnv32(kolId)
//   [12-15] random nonce (cloid must be unique per order)

const MAGIC = "e010";

function fnv1a(str: string, bytes: number): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // widen deterministically for >4 bytes by rehashing with a suffix
  let out = h.toString(16).padStart(8, "0");
  if (bytes > 4) {
    let h2 = 0x811c9dc5;
    const s2 = str + "";
    for (let i = 0; i < s2.length; i++) {
      h2 ^= s2.charCodeAt(i);
      h2 = Math.imul(h2, 0x01000193) >>> 0;
    }
    out += h2.toString(16).padStart(8, "0");
  }
  return out.slice(0, bytes * 2);
}

export function makeCloid(tradeId: string, kolId: string): `0x${string}` {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${MAGIC}${fnv1a(tradeId, 6)}${fnv1a(kolId || "house", 4)}${nonce}` as `0x${string}`;
}

export interface DecodedCloid {
  tradeId: string | null; // null = ours but unknown trade (registry drift)
  kolId: string | null;
  ours: boolean;
}

/** Decode a fill's cloid against the known registries. */
export function decodeCloid(
  cloid: string | undefined,
  tradeIds: string[],
  kolIds: string[],
): DecodedCloid {
  if (!cloid) return { tradeId: null, kolId: null, ours: false };
  const h = cloid.toLowerCase().replace(/^0x/, "");
  if (h.length !== 32 || !h.startsWith(MAGIC)) return { tradeId: null, kolId: null, ours: false };
  const tHash = h.slice(4, 16);
  const kHash = h.slice(16, 24);
  const tradeId = tradeIds.find((t) => fnv1a(t, 6) === tHash) ?? null;
  const kolId = [...kolIds, "house"].find((k) => fnv1a(k || "house", 4) === kHash) ?? null;
  return { tradeId, kolId, ours: true };
}
