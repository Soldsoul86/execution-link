import { NETWORK_LABEL, REPO_URL } from "./config";

// KOL-first landing: what a KOL sees when they open the bare link on their phone.
export default function Landing() {
  return (
    <main className="card landing">
      <header>
        <h1>Your trade. Their account. One click.</h1>
        <p className="venue">Execution links for {NETWORK_LABEL} · non-custodial · every fee disclosed</p>
      </header>

      <section>
        <h2>How it works</h2>
        <ol>
          <li><b>You post the trade you're taking</b> — entry, take-profit, stop-loss — as a link.</li>
          <li><b>Followers tap it</b>, connect their own wallet, pick their own size, and sign your whole plan into <i>their own</i> Hyperliquid account. Not yours. Not ours.</li>
          <li><b>You earn 50%</b> of our 4 bps builder fee on every execution — disclosed right on the card, verifiable on-chain, paid weekly.</li>
        </ol>
      </section>

      <section>
        <h2>Why your followers trust it</h2>
        <ul>
          <li>No deposits with anyone. They keep custody; they sign every order.</li>
          <li>Your cut is printed on the card — transparency as the default.</li>
          <li>Stops go in <i>with</i> the entry. They copy your risk plan, not just your entry.</li>
          <li>Every call is timestamped; every fill is on-chain. Your track record becomes provable, not screenshots.</li>
        </ul>
      </section>

      <section className="landing-ctas">
        <a className="btn primary" href="?t=demo-btc-long&v=d&as=%40yourhandle">See a trade card with your name on it</a>
        <a className="btn" href="dash.html?demo=1">Open the KOL console (demo)</a>
        <a className="btn" href={`${REPO_URL}/blob/main/kit/kol-onepager.md`}>Read the one-pager</a>
        <a className="btn" href={`${REPO_URL}/blob/main/kit/follower-guide.md`}>Follower guide (forward this to your audience)</a>
      </section>

      <footer>
        <p>
          Fully client-side and open-source — <a href={REPO_URL}>read the source</a>. We never touch
          funds; our fee approval is capped and revocable on Hyperliquid itself.
        </p>
      </footer>
    </main>
  );
}
