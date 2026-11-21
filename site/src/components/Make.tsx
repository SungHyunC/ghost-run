import { MAKE_HEADS } from '../data/copy';
import { Icon } from './art/Icon';

export function Make() {
  return (
    <section className="sec" id="make">
      <div className="sec-head">
        <span className="nbadge">4</span>
        <h2 tabIndex={-1}>{MAKE_HEADS.heading}</h2>
      </div>
      <p className="sec-sub">{MAKE_HEADS.sub}</p>
      <div className="make">
        <div className="book">
          <div className="book-t">{MAKE_HEADS.spellbookTitle}</div>
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
            <h3>{MAKE_HEADS.agentTitle}</h3>
          </div>
          <p>{MAKE_HEADS.agentText}</p>
          <code className="cmd">{MAKE_HEADS.command}</code>
          <div className="proof">{MAKE_HEADS.closing}</div>
        </div>
      </div>
    </section>
  );
}
