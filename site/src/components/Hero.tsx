import { HeroArt, Hill, PumpkinRow } from './art/HeroArt';

export function Hero() {
  return (
    <header className="hero">
      <div>
        <span className="kicker">🎃 Kiroween 2026 · Skeleton Crew</span>
        <h1>
          Let your agent's <em>ghost</em> try it first.
        </h1>
        <p>
          A Kiro template for apps that rehearse risky plans on a <b>ghost copy</b> of the world.{' '}
          <b>One skeleton, three costumes.</b>
        </p>
        <div className="cta">
          <a className="btn btn-main" href="#recipe">
            Meet the skeleton
          </a>
          <a className="btn" href="#run">
            Watch the ghost work
          </a>
        </div>
      </div>
      <HeroArt />
      <Hill />
      <PumpkinRow />
    </header>
  );
}
