import type { CSSProperties } from 'react';
import type { CopyScene, RealityScene } from '../../../data/types';
import type { CopyItemState } from '../../../engine/types';

type HandReality = Extract<RealityScene, { kind: 'hand' }>;
type HandTiles = Extract<CopyScene, { kind: 'hand' }>['tiles'];
type HandState = Extract<CopyItemState, { world: 'hand' }>;

export type HandPaneProps =
  | { side: 'real'; scene: HandReality }
  | { side: 'copy'; tiles: HandTiles; state: HandState };

const idx = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

/** `miniScene` of the Mockup. */
function MiniScene() {
  return (
    <svg viewBox="0 0 60 40" aria-hidden="true">
      <rect x="31" y="9" width="25" height="28" rx="3" fill="#8a5a3c" />
      <rect className="drawer" x="33" y="20" width="21" height="9" rx="2" fill="#c08a5c" />
      <circle className="drawer" cx="35.5" cy="24.5" r="1.4" fill="#3b2b10" />
      <path d="M38 9q-1-5 3-6q3 1 2 6z" fill="#7fd6ff" />
      <path
        d="M4 37L14 26L30 24"
        stroke="#aef5df"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".9"
      />
      <rect x="1" y="35" width="9" height="4" rx="1.5" fill="#6d7488" />
    </svg>
  );
}

/** `bigScene` of the Mockup. */
function BigScene({ label }: { label: string }) {
  return (
    <svg className="scene" viewBox="0 0 220 132" aria-hidden="true">
      <rect x="0" y="122" width="220" height="10" rx="3" fill="#d9c7a0" />
      <rect x="118" y="44" width="92" height="78" rx="7" fill="#8a5a3c" />
      <rect x="124" y="50" width="80" height="22" rx="4" fill="#7a4e33" />
      <rect className="drawer" x="124" y="80" width="80" height="30" rx="4" fill="#c08a5c" />
      <circle className="drawer" cx="132" cy="95" r="3.4" fill="#3b2b10" />
      <path d="M150 44q-6-16 4-24h12q10 8 4 24z" fill="#7fd6ff" stroke="#4aa8d6" strokeWidth="2" />
      <circle cx="156" cy="16" r="4" fill="#ff9ec7" />
      <circle cx="164" cy="13" r="4" fill="#ffd36b" />
      <rect x="14" y="108" width="40" height="14" rx="4" fill="#8b94a8" />
      <path d="M34 108L52 64L116 92" stroke="#b4bccd" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="52" cy="64" r="7" fill="#8b94a8" />
      <path d="M116 86v12M120 86l6 6M120 98l6-6" stroke="#6d7488" strokeWidth="3.5" strokeLinecap="round" />
      <text x="12" y="20" fontSize="10" fill="#7a5a2a" fontFamily="Fredoka,system-ui">
        {label}
      </text>
    </svg>
  );
}

/** The scene builder `handPane` of the Mockup. */
export function HandPane(props: HandPaneProps) {
  if (props.side === 'real') return <BigScene label={props.scene.label} />;
  const { tiles, state } = props;
  return (
    <div className="tiles">
      {tiles.map((t, k) => {
        const s = state.tiles[k] ?? 'idle';
        return (
          <div className={s === 'idle' ? 'tile' : `tile ${s}`} key={t.id} style={idx(k)} data-variant={t.id}>
            <MiniScene />
            <span className="hl">{t.label}</span>
            {s !== 'idle' && t.jointLimit ? <span className="jl">joint limit</span> : null}
            <span className="res" />
          </div>
        );
      })}
    </div>
  );
}
