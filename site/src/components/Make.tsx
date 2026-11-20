import { Icon } from './art/Icon';

export function Make() {
  return (
    <section className="sec" id="make">
      <div className="sec-head">
        <span className="nbadge">4</span>
        <h2>Make your own costume</h2>
      </div>
      <p className="sec-sub">Write six functions, or let a Kiro agent write them with you.</p>
      <div className="make">
        <div className="book">
          <div className="book-t">📖 The spell: a world in six functions</div>
          <pre>
            <span className="k">const</span>
            {' myWorld: World<MyState, MyAction> = {\n  snapshot,       '}
            <span className="c">// copy reality, never touch it</span>
            {'\n  step,           '}
            <span className="c">// try one action on the copy</span>
            {'\n  diff,           '}
            <span className="c">// what changed</span>
            {'\n  render,         '}
            <span className="c">// a scene for the skeleton&apos;s screens</span>
            {'\n  fingerprint,    '}
            <span className="c">// prove reality stayed the same</span>
            {'\n  effectsOutside, '}
            <span className="c">// what would leave the box</span>
            {'\n};'}
          </pre>
        </div>
        <div className="agent">
          <div className="ah">
            <Icon id="i-hat" viewBox="0 0 40 40" />
            <h3>Ask world-smith</h3>
          </div>
          <p>
            A Kiro custom agent. It copies the spec template, writes the world with you one file at a time, and runs the
            registration gate and the wards.
          </p>
          <code className="cmd">kiro-cli chat --agent world-smith</code>
          <div className="proof">🎃 Ghost Cloud was made this way.</div>
        </div>
      </div>
    </section>
  );
}
