import { useState, type ReactNode } from 'react';
import { COSTUMES_HEADS } from '../data/copy';
import { COSTUME_CARDS, type CostumeCardData } from '../data/skeleton';
import { PARTS_MATRIX, PART_NAMES, type CostumeId } from '../data/parts-matrix';
import { defaultScheduler, type Scheduler } from '../engine/scheduler';
import { useReducedMotion } from '../engine/useReducedMotion';
import { useXrayDemo } from '../engine/useXrayDemo';
import { CloudFigure, HandFigure, ShellFigure } from './art/Figures';
import { Icon, type SymbolId } from './art/Icon';
import type { AppPart } from '../data/types';
import type { PageVisibility } from '../engine/paging';

interface ChipIcon {
  label: string;
  id: SymbolId;
  viewBox: string;
}

const CHIP_ICONS: Readonly<Record<AppPart, ChipIcon>> = {
  mirror: { label: 'Mirror', id: 'i-mirror', viewBox: '0 0 40 40' },
  ghost: { label: 'Ghost', id: 'boo', viewBox: '0 0 120 130' },
  wards: { label: 'Wards', id: 'i-ward', viewBox: '0 0 40 40' },
  candle: { label: 'Candle', id: 'i-candle', viewBox: '0 0 40 40' },
  blacklight: { label: 'Blacklight', id: 'i-blacklight', viewBox: '0 0 40 40' },
  graveyard: { label: 'Graveyard', id: 'i-tomb', viewBox: '0 0 40 40' },
};

const FIGURES: Readonly<Record<CostumeId, () => ReactNode>> = {
  shell: () => <ShellFigure />,
  hand: () => <HandFigure />,
  cloud: () => <CloudFigure />,
};

export function XraySwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="xsw">
      <span className="try">try me</span>
      <input
        type="checkbox"
        id="xray"
        role="switch"
        aria-label="X-ray: show the skeleton inside each app"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => {
          onChange(e.currentTarget.checked);
        }}
      />{' '}
      X-ray
    </label>
  );
}

export function PartChips({ costume }: { costume: CostumeId }) {
  return (
    <div className="used">
      {PART_NAMES.map((part) => {
        const icon = CHIP_ICONS[part];
        const used = PARTS_MATRIX[costume][part];
        return (
          <span key={part} className={used ? undefined : 'off'}>
            <Icon id={icon.id} viewBox={icon.viewBox} />
            {icon.label}
            {used ? null : <span className="sr-only"> not used</span>}
          </span>
        );
      })}
    </div>
  );
}

export function CostumeCard({ card }: { card: CostumeCardData }) {
  return (
    <article className="cc">
      <div className="cc-art">
        <span className="same">same skeleton ✓</span>
        {FIGURES[card.id]()}
      </div>
      <h3>{card.name}</h3>
      <p className="cos">{card.costume}</p>
      <div className="wl">
        <Icon id="pumpkin" viewBox="0 0 64 58" />
        <div>{card.world}</div>
      </div>
      <PartChips costume={card.id} />
      <p className="kiro">
        {card.provenance.prefix} <code>{card.provenance.code}</code>
      </p>
      <a className="btn small" href={card.link.href}>
        {card.link.text}
      </a>
    </article>
  );
}

export interface CostumesProps {
  scheduler?: Scheduler;
  /** The page visibility value; the X-ray peek starts when this page is first opened. */
  visibility: PageVisibility;
}

export function Costumes({ scheduler = defaultScheduler, visibility }: CostumesProps) {
  const [on, setOn] = useState(false);
  const reduced = useReducedMotion();
  const cancel = useXrayDemo(scheduler, reduced, setOn, {
    started: visibility.opened.costumes,
    active: visibility.current === 'costumes',
  });

  return (
    <section className={on ? 'sec xray' : 'sec'} id="costumes">
      <div className="sec-head">
        <span className="nbadge">2</span>
        <h2 tabIndex={-1}>{COSTUMES_HEADS.heading}</h2>
        <XraySwitch
          checked={on}
          onChange={(v) => {
            cancel();
            setOn(v);
          }}
        />
      </div>
      <p className="sec-sub">{COSTUMES_HEADS.sub}</p>
      <div className="cards">
        {COSTUME_CARDS.map((card) => (
          <CostumeCard key={card.id} card={card} />
        ))}
      </div>
      <p className="cards-note">{COSTUMES_HEADS.legend}</p>
    </section>
  );
}
