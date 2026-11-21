import { LINES_TOKEN, RECIPE_HEADS } from '../data/copy';
import { SKELETON_PARTS, SPEC_NAMES, WORLD_FUNCTIONS } from '../data/skeleton';
import { Cauldron } from './art/Cauldron';
import { Icon, type SymbolId } from './art/Icon';

interface PartIcon {
  id: SymbolId;
  viewBox: string;
}

const PART_ICONS: Readonly<Record<string, PartIcon>> = {
  Mirror: { id: 'i-mirror', viewBox: '0 0 40 40' },
  Ghost: { id: 'boo', viewBox: '0 0 120 130' },
  Wards: { id: 'i-ward', viewBox: '0 0 40 40' },
  Candle: { id: 'i-candle', viewBox: '0 0 40 40' },
  Blacklight: { id: 'i-blacklight', viewBox: '0 0 40 40' },
  Graveyard: { id: 'i-tomb', viewBox: '0 0 40 40' },
  'Kiro hook': { id: 'i-hook', viewBox: '0 0 40 40' },
  'world-smith': { id: 'i-hat', viewBox: '0 0 40 40' },
};

export function WorldIngredient({ lineCount }: { lineCount: number }) {
  return (
    <div className="ing ing-world">
      <div className="ing-head">
        <Icon id="pumpkin" viewBox="0 0 64 58" />
        <div>
          <h3>{RECIPE_HEADS.worldTitle}</h3>
          <p className="sub">{RECIPE_HEADS.worldSub}</p>
        </div>
      </div>
      <ul className="fnl">
        {WORLD_FUNCTIONS.map((f) => (
          <li key={f.name}>
            <code>{f.name}</code>
            {f.line}
          </li>
        ))}
      </ul>
      <p className="lean">{RECIPE_HEADS.sticker.replace(LINES_TOKEN, String(lineCount))}</p>
    </div>
  );
}

export function SkeletonIngredient() {
  return (
    <div className="ing ing-skel">
      <div className="ing-head">
        <Icon id="bones" viewBox="0 -10 120 182" className="fig" />
        <div>
          <h3>{RECIPE_HEADS.skeletonTitle}</h3>
          <p className="sub">{RECIPE_HEADS.skeletonSub}</p>
        </div>
      </div>
      <div className="parts">
        {SKELETON_PARTS.map((p) => {
          const icon = PART_ICONS[p.name];
          return (
            <div className="part" key={p.name}>
              {icon ? <Icon id={icon.id} viewBox={icon.viewBox} /> : null}
              <b>{p.name}</b>
              <span>{p.line}</span>
            </div>
          );
        })}
      </div>
      <div className="built">
        <span className="chip" title={SPEC_NAMES.join(', ')}>
          {RECIPE_HEADS.chipText}
        </span>
      </div>
    </div>
  );
}

export function Recipe({ lineCount }: { lineCount: number }) {
  return (
    <section className="sec" id="recipe">
      <div className="sec-head">
        <span className="nbadge">1</span>
        <h2 tabIndex={-1}>{RECIPE_HEADS.heading}</h2>
      </div>
      <p className="sec-sub">{RECIPE_HEADS.sub}</p>
      <div className="recipe">
        <WorldIngredient lineCount={lineCount} />
        <div className="op" aria-hidden="true">
          +
        </div>
        <SkeletonIngredient />
      </div>
      <div className="equals">
        <div className="op" aria-hidden="true">
          =
        </div>
        <div className="result">
          <Cauldron />
          <div>
            <h3>{RECIPE_HEADS.resultTitle}</h3>
            <p>{RECIPE_HEADS.resultText}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
