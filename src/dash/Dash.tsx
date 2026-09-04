import { useEffect, useMemo, useRef, useState } from "react";
import { BUILDER_ADDRESS, NETWORK_LABEL } from "../config";
import { TRADES } from "../trades";
import {
  addToRoster, computeCallStats, computeTraderStats, demoData, fetchOpenCoins,
  fetchOurFills, getRoster, SEGMENT_META,
  type CallStats, type OurFill, type Segment, type TraderStats,
} from "./data";

const KOL_SHARE = 0.5;
const fmt$ = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 });
const ago = (t: number) => {
  if (!t) return "—";
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d === 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
};
const short = (a: string) => (a.length > 12 ? a.slice(0, 6) + "…" + a.slice(-4) : a);

type Tab = "overview" | "traders" | "calls" | "segments" | "profile";

export default function Dash() {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo") === "1";
  const kolFilter = params.get("kol") ?? "";
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "overview");
  const [roster, setRoster] = useState<string[]>(getRoster());
  const addRef = useRef<HTMLInputElement>(null);
  const [fills, setFills] = useState<OurFill[]>([]);
  const [traders, setTraders] = useState<TraderStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh(r = roster) {
    if (demo) {
      const d = demoData();
      setFills(d.fills);
      setTraders(d.traders);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const all: OurFill[] = [];
      const ts: TraderStats[] = [];
      for (const addr of r) {
        const [fs, open] = await Promise.all([fetchOurFills(addr), fetchOpenCoins(addr)]);
        all.push(...fs);
        ts.push(computeTraderStats(addr, fs, open));
      }
      setFills(all);
      setTraders(ts.sort((a, b) => b.volume - a.volume));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, [demo]);

  const scoped = useMemo(
    () => (kolFilter ? fills.filter((f) => f.kolId === kolFilter) : fills),
    [fills, kolFilter],
  );
  const calls: CallStats[] = useMemo(() => computeCallStats(scoped), [scoped]);
  const totVol = scoped.reduce((a, f) => a + f.notional, 0);
  const totFees = scoped.reduce((a, f) => a + f.builderFee, 0);
  const activeTraders = traders.filter((t) => t.segments.includes("active"));
  const newTraders = traders.filter((t) => t.segments.includes("new"));
  const dormant = traders.filter((t) => t.segments.includes("dormant"));
  const repeat = traders.filter((t) => t.segments.includes("repeat"));

  const callDef = (id: string) => TRADES.find((t) => t.id === id);

  return (
    <main className="dash">
      <header className="dashhead">
        <h1>KOL Console {demo && <span className="demo-badge">DEMO DATA</span>}</h1>
        <p className="sub">
          {NETWORK_LABEL} · builder <code>{short(BUILDER_ADDRESS)}</code>
          {kolFilter && <> · viewing KOL <b>{kolFilter}</b></>}
          {" · "}
          <a href={demo ? "?" : "?demo=1"}>{demo ? "exit demo" : "demo mode"}</a>
        </p>
        <nav>
          {(["overview", "traders", "calls", "segments", "profile"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
      </header>

      {err && <p className="error">Data error: {err}</p>}
      {loading && <p className="muted">Loading fills from {NETWORK_LABEL}…</p>}

      {tab === "overview" && (
        <>
          <section className="tiles">
            <div className="tile"><span>Traders</span><b>{traders.length}</b></div>
            <div className="tile"><span>Active (7d)</span><b>{activeTraders.length}</b></div>
            <div className="tile"><span>New (7d)</span><b>{newTraders.length}</b></div>
            <div className="tile"><span>Repeat</span><b>{repeat.length}</b></div>
            <div className="tile"><span>Dormant</span><b>{dormant.length}</b></div>
            <div className="tile"><span>Follower volume</span><b>{fmt$(totVol)}</b></div>
            <div className="tile"><span>Builder revenue</span><b>{fmt$(totFees)}</b></div>
            <div className="tile money"><span>KOL share (50%)</span><b>{fmt$(totFees * KOL_SHARE)}</b></div>
          </section>
          <section className="panel">
            <h2>Revenue</h2>
            <dl className="kv">
              <dt>Follower volume</dt><dd>{fmt$(totVol)}</dd>
              <dt>Builder revenue (4 bps)</dt><dd>{fmt$(totFees)}</dd>
              <dt>Your share (50%)</dt><dd className="money">{fmt$(totFees * KOL_SHARE)}</dd>
              <dt>Pending</dt><dd>{fmt$(totFees * KOL_SHARE)}</dd>
              <dt>Paid</dt><dd>{fmt$(0)} <span className="muted">(weekly payouts start with the first mainnet cycle)</span></dd>
            </dl>
          </section>
        </>
      )}

      {tab === "traders" && (
        <section className="panel">
          <h2>Traders ({traders.length})</h2>
          {!demo && (
            <p className="rosterrow">
              <input ref={addRef} placeholder="0x… add trader address to roster" />
              <button onClick={() => { const v = addRef.current?.value.trim() ?? ""; if (/^0x[0-9a-fA-F]{40}$/.test(v)) { const r = addToRoster(v); setRoster(r); if (addRef.current) addRef.current.value = ""; void refresh(r); } }}>Add</button>
              <span className="muted">Roster is fed by funnel beacons; add manually for now.</span>
            </p>
          )}
          <div className="tablewrap"><table>
            <thead><tr><th>Trader</th><th>Segments</th><th>Calls followed</th><th>Trades</th><th>Volume</th><th>Realized P&L</th><th>Open</th><th>Last active</th></tr></thead>
            <tbody>
              {traders.map((t) => (
                <tr key={t.address}>
                  <td><code>{short(t.address)}</code></td>
                  <td>{t.segments.map((s) => <span key={s} title={SEGMENT_META[s].label}>{SEGMENT_META[s].icon}</span>)}</td>
                  <td>{t.calls.length ? t.calls.join(", ") : <span className="muted">untagged</span>}</td>
                  <td className="num">{t.fills}</td>
                  <td className="num">{fmt$(t.volume)}</td>
                  <td className={"num " + (t.realizedPnl >= 0 ? "pos" : "neg")}>{fmt$(t.realizedPnl)}</td>
                  <td>{t.openPositionCoins.join(", ") || "—"}</td>
                  <td>{ago(t.lastActive)}</td>
                </tr>
              ))}
              {!traders.length && <tr><td colSpan={8} className="muted">No traders yet — share your first link, or open demo mode.</td></tr>}
            </tbody>
          </table></div>
        </section>
      )}

      {tab === "calls" && (
        <section className="panel">
          <h2>Calls ({calls.length})</h2>
          <div className="tablewrap"><table>
            <thead><tr><th>Call</th><th>Plan</th><th>Traders</th><th>Executions</th><th>Entries open</th><th>Exits</th><th>Volume</th><th>Realized P&L</th><th>Fees</th><th>Last activity</th></tr></thead>
            <tbody>
              {calls.map((c) => {
                const d = callDef(c.tradeId);
                return (
                  <tr key={c.tradeId}>
                    <td><b>{c.tradeId}</b></td>
                    <td>{d ? `${d.coin} ${d.closeOnly ? "EXIT" : d.isBuy ? "LONG" : "SHORT"}${d.tpPct ? ` · TP +${d.tpPct}%` : ""}${d.slPct ? ` · SL -${d.slPct}%` : ""}` : "—"}</td>
                    <td className="num">{c.traders}</td>
                    <td className="num">{c.executions}</td>
                    <td className="num">{c.openEntries - c.exits > 0 ? c.openEntries - c.exits : 0}</td>
                    <td className="num">{c.exits}</td>
                    <td className="num">{fmt$(c.volume)}</td>
                    <td className={"num " + (c.realizedPnl >= 0 ? "pos" : "neg")}>{fmt$(c.realizedPnl)}</td>
                    <td className="num">{fmt$(c.builderFees)}</td>
                    <td>{ago(c.lastActivity)}</td>
                  </tr>
                );
              })}
              {!calls.length && <tr><td colSpan={10} className="muted">No executions yet.</td></tr>}
            </tbody>
          </table></div>
          <p className="muted">Views→clicks funnel appears here once the beacon worker is deployed; execution-side numbers are on-chain truth already.</p>
        </section>
      )}

      {tab === "segments" && (
        <section className="panel">
          <h2>Follow-up queue</h2>
          <p className="muted">Suggested actions only — copy a message and send it yourself where the trader already talks to you. No automated outreach, ever.</p>
          {(Object.keys(SEGMENT_META) as Segment[]).map((seg) => {
            const list = traders.filter((t) => t.segments.includes(seg));
            if (!list.length) return null;
            return (
              <div key={seg} className="segblock">
                <h3>{SEGMENT_META[seg].icon} {SEGMENT_META[seg].label} ({list.length})</h3>
                <p className="action">→ {SEGMENT_META[seg].action}</p>
                <p className="addrs">{list.map((t) => <code key={t.address}>{short(t.address)}</code>)}</p>
              </div>
            );
          })}
          {!traders.length && <p className="muted">No traders yet.</p>}
        </section>
      )}

      {tab === "profile" && (
        <section className="panel profile">
          <h2>Public profile preview {kolFilter && <>— {kolFilter}</>}</h2>
          <div className="profilecard">
            <h3>{kolFilter ? `@${kolFilter}` : "@your-handle"}</h3>
            <p className="bigline">{traders.length} traders · {fmt$(totVol)} follower volume · {activeTraders.length} active this month</p>
            <p>{calls.length} tracked calls · every execution on-chain-verifiable · fees disclosed on every card</p>
            <h4>Recent calls</h4>
            <ul>
              {calls.slice(0, 5).map((c) => {
                const d = callDef(c.tradeId);
                const r = d?.tpPct && d?.slPct ? (c.realizedPnl >= 0 ? `+${(d.tpPct / d.slPct).toFixed(1)}R plan` : `${(-1).toFixed(1)}R plan`) : "";
                return <li key={c.tradeId}>{d ? `${d.coin} ${d.isBuy ? "Long" : "Short"}` : c.tradeId} — {c.traders} traders, {fmt$(c.volume)} {r && `· ${r}`}</li>;
              })}
              {!calls.length && <li className="muted">Calls appear here as followers execute them.</li>}
            </ul>
            <p className="muted">This page is the KOL's verifiable track record: timestamped links + on-chain fills, not screenshots.</p>
          </div>
        </section>
      )}

      <footer className="muted">
        One event stream, many views · fills read from {NETWORK_LABEL} public APIs · attribution via on-chain cloid tags · <a href="./">execution page</a>
      </footer>
    </main>
  );
}
