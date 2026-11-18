import { buildCandleModel, listItemText, type CandleModel, type ListItem } from '../model/candle';
import { buildClaimModel, type ClaimModel } from '../model/claims';
import type { CandleProps } from '../types';
import { FlameArt } from './art/FlameArt';
import { Icon } from './art/Icon';
import { ClaimBanner } from './ClaimBanner';
import { KitBoundary } from './KitBoundary';
import { Placeholder } from './Placeholder';

function Items({ items, label }: { readonly items: readonly ListItem[]; readonly label: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="gk-list gk-mono" aria-label={label}>
      {items.map((item, index) => (
        <li key={index}>{listItemText(item)}</li>
      ))}
    </ul>
  );
}

/** Pure view of the candle container. Never states that an action is approved or safe. */
export function CandleView({ model, claims }: { readonly model: CandleModel; readonly claims: ClaimModel }) {
  const flame = model.state === 'lit' || model.state === 'flickering' || model.state === 'out' ? model.state : null;
  return (
    <section className="gk-candle" data-candle-state={model.state} aria-label={model.accessibleLabel}>
      {flame !== null ? <FlameArt state={flame} /> : <Icon id={model.icon} />}
      <div className="gk-candle-main">
        <p className="gk-candle-label">
          <Icon id={model.icon} />
          <span>{model.textLabel}</span>
        </p>
        <div role="status" aria-live="polite" className="gk-sr-only">
          {model.accessibleLabel}
        </div>
        {model.unknownValueText !== undefined ? <p className="gk-mono">{model.unknownValueText}</p> : null}
        {model.inconsistency !== undefined ? <p className="gk-warn">{model.inconsistency}</p> : null}
        {model.noticeSummary !== undefined ? <p className="gk-warn">{model.noticeSummary}</p> : null}
        {model.wardLines.length > 0 ? (
          <ul className="gk-list gk-mono" aria-label="Wards">
            {model.wardLines.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        ) : null}
        <Items items={model.violationItems} label="Violations" />
        <Items items={model.noticeItems} label="Notices" />
      </div>
      <div className="gk-candle-claims">
        <ClaimBanner model={claims} />
      </div>
    </section>
  );
}

function CandleInner({ verdict, claims }: CandleProps) {
  const model = buildCandleModel(verdict);
  if (model.kind === 'unreadable') return <Placeholder name="Candle" />;
  return <CandleView model={model} claims={buildClaimModel(claims)} />;
}

export function Candle(props: CandleProps) {
  return (
    <KitBoundary name="Candle">
      <CandleInner {...props} />
    </KitBoundary>
  );
}
