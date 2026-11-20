import { Icon } from './Icon';

// Night-sky scene of the Mockup. Path data is unchanged.
export function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg className="moon" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" fill="#fff4cf" />
        <circle cx="42" cy="48" r="9" fill="#f3e3ae" />
        <circle cx="74" cy="76" r="12" fill="#f3e3ae" />
        <circle cx="78" cy="38" r="5" fill="#f3e3ae" />
      </svg>
      <Icon id="bat" viewBox="0 0 60 30" className="bat b1" />
      <Icon id="bat" viewBox="0 0 60 30" className="bat b2" />
      <Icon id="bat" viewBox="0 0 60 30" className="bat b3" />
      <div className="aura"></div>
      <Icon id="boo" viewBox="0 0 120 130" className="hero-boo" />
      <svg className="hero-candle bigcandle" viewBox="0 0 40 70" aria-hidden="true">
        <rect x="11" y="26" width="18" height="40" rx="4" fill="#fff1d6" />
        <path d="M11 32q4 4 8 0q2 6 4 0" stroke="#efd9ad" strokeWidth="2.4" fill="none" />
        <line x1="20" y1="26" x2="20" y2="21" stroke="#3a3326" strokeWidth="2" />
        <path className="flame" d="M20 4q8 8 0 17q-8-9 0-17z" fill="#ffb347" />
        <circle cx="16.5" cy="42" r="1.7" fill="#2a1b3d" />
        <circle cx="23.5" cy="42" r="1.7" fill="#2a1b3d" />
        <path d="M17.5 46.5q2.5 2 5 0" stroke="#2a1b3d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Hill() {
  return (
    <svg className="hill" viewBox="0 0 1000 96" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 60Q160 18 330 48T680 40T1000 30V96H0z" fill="#170b31" />
      <path d="M0 78Q220 50 470 70T1000 58V96H0z" fill="#0f0722" />
    </svg>
  );
}

export function PumpkinRow() {
  return (
    <div className="pk-row" aria-hidden="true">
      <Icon id="pumpkin" viewBox="0 0 64 58" className="sm" />
      <Icon id="pumpkin" viewBox="0 0 64 58" />
      <Icon id="pumpkin" viewBox="0 0 64 58" className="sm" />
    </div>
  );
}
