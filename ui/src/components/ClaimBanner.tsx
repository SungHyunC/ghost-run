import type { ClaimModel } from '../model/claims';
import { Icon } from './art/Icon';

/** Three claim lines (text plus icon) and the independent banner paragraphs. Renders ClaimLine.text and ClaimLine.icon as given. */
export function ClaimBanner({ model }: { readonly model: ClaimModel }) {
  return (
    <div role="group" aria-label="Isolation claims" className="gk-claims">
      <ul className="gk-claim-list">
        {model.lines.map((line) => (
          <li key={line.id} className={`gk-claim-line gk-claim-${line.status}`} data-claim-id={line.id}>
            <Icon id={line.icon} />
            <span className="gk-claim-text gk-mono">{line.text}</span>
          </li>
        ))}
      </ul>
      {model.assuranceText !== null ? (
        <p className="gk-assurance" data-claim="assurance">
          {model.assuranceText}
        </p>
      ) : null}
      {model.staticBanner !== null ? (
        <p className="gk-banner" data-claim="static">
          {model.staticBanner}
        </p>
      ) : null}
      {model.notClaimedBanner !== null ? (
        <p className="gk-banner" data-claim="not-claimed">
          {model.notClaimedBanner}
        </p>
      ) : null}
    </div>
  );
}
