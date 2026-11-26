import { COVER } from '../data/copy';
import { HeroArt, Hill, PumpkinRow } from './art/HeroArt';

export function Hero() {
  return (
    <header className="hero">
      <div>
        <span className="kicker">{COVER.kicker}</span>
        <h1 tabIndex={-1}>
          {COVER.headingBefore}
          <em>{COVER.headingEm}</em>
          {COVER.headingAfter}
        </h1>
        <p>
          {COVER.textBefore}
          <b>{COVER.textBold}</b>
        </p>
        <div className="cta">
          <a className="btn btn-main" href={COVER.primaryButton.href}>
            {COVER.primaryButton.text}
          </a>
          <a className="btn" href={COVER.secondaryButton.href}>
            {COVER.secondaryButton.text}
          </a>
        </div>
        <div className="cta cta-apps">
          {COVER.appLinks.map((app) => (
            <a key={app.href} className="btn small" href={app.href}>
              <span className="app-tag">{app.tag}</span>
              <b>{app.name}</b>
              <span className="app-label">{app.label}</span>
            </a>
          ))}
        </div>
      </div>
      <HeroArt />
      <Hill />
      <PumpkinRow />
    </header>
  );
}
