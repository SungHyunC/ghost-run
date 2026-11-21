import type { ComponentType } from 'react';
import { Sprite } from '../components/art/Sprite';
import { Nav } from '../components/Nav';
import {
  FOOTER_CODE,
  FOOTER_GALLERY_HREF,
  FOOTER_GALLERY_LABEL,
  FOOTER_LEAD,
  FOOTER_TAIL,
  PART_ROWS,
} from './copy';
import { Hero } from './Hero';
import { PartCards } from './PartCards';
import { PartRow } from './PartRow';
import { BlacklightRow } from './rows/BlacklightRow';
import { CandleRow } from './rows/CandleRow';
import { ControlsRow } from './rows/ControlsRow';
import { GraveRow } from './rows/GraveRow';
import { LightsRow } from './rows/LightsRow';
import { MirrorRow } from './rows/MirrorRow';
import { ThreadRow } from './rows/ThreadRow';

const ROW_BODIES: Record<string, ComponentType> = {
  'p-mirror': MirrorRow,
  'p-candle': CandleRow,
  'p-blacklight': BlacklightRow,
  'p-thread': ThreadRow,
  'p-grave': GraveRow,
  'p-lights': LightsRow,
  'p-controls': ControlsRow,
};

export function ShowcaseApp() {
  return (
    <div className="site">
      <Sprite />
      <div className="wrap">
        <Nav current="kit" root="../" />
        <main>
          <Hero />
          <PartCards />
          {PART_ROWS.map((r, i) => (
            <PartRow key={r.id} {...r} flip={i % 2 === 1}>
              {(() => {
                const Body = ROW_BODIES[r.id];
                return Body === undefined ? null : <Body />;
              })()}
            </PartRow>
          ))}
        </main>
        <footer className="foot">
          <span>
            {FOOTER_LEAD}
            <code>{FOOTER_CODE}</code>
            {FOOTER_TAIL}
          </span>
          <a href={FOOTER_GALLERY_HREF}>{FOOTER_GALLERY_LABEL}</a>
        </footer>
      </div>
    </div>
  );
}
