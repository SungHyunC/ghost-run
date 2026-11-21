import { HeroArt } from './art/HeroArt';
import {
  HERO_CHIPS,
  HERO_HEADING_EM,
  HERO_HEADING_LEAD,
  HERO_HEADING_TAIL,
  HERO_KICKER,
  HERO_TEXT,
} from './copy';

export function Hero() {
  return (
    <header className="khero">
      <div className="khero-t">
        <span className="kicker">{HERO_KICKER}</span>
        <h1>
          {HERO_HEADING_LEAD}
          <em>{HERO_HEADING_EM}</em>
          {HERO_HEADING_TAIL}
        </h1>
        <p>{HERO_TEXT}</p>
        <div className="kchips">
          {HERO_CHIPS.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
      <HeroArt />
    </header>
  );
}
