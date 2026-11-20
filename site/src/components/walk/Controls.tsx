import { STEPS, WORLDS, type WorldId } from '../../config';
import { Icon } from '../art/Icon';

const WORLD_NAMES: Readonly<Record<WorldId, string>> = {
  shell: 'Ghost Shell',
  hand: 'Ghost Hand',
  cloud: 'Ghost Cloud',
};

export interface WorldChipsProps {
  world: WorldId;
  onPick: (world: WorldId) => void;
  onReplay: () => void;
}

/** The three world chips and the Replay button. */
export function WorldChips({ world, onPick, onReplay }: WorldChipsProps) {
  return (
    <div className="wbar">
      <div className="wchips" id="wchips">
        {WORLDS.map((w) => (
          <button
            type="button"
            className="wchip"
            data-w={w}
            aria-pressed={w === world}
            key={w}
            onClick={() => {
              onPick(w);
            }}
          >
            <Icon id="pumpkin" viewBox="0 0 64 58" />
            {WORLD_NAMES[w]}
          </button>
        ))}
      </div>
      <button type="button" className="btn small replay" id="replay" onClick={onReplay}>
        ↻ Replay
      </button>
    </div>
  );
}

/** The ordered list of five step buttons. `step` is 0-based; -1 means no step yet. */
export function StepRail({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <ol className="rail" id="rail">
      {STEPS.map((s, k) => {
        const cls = k === step ? 'now' : k < step ? 'done' : undefined;
        return (
          <li key={s.num}>
            <button
              type="button"
              data-s={k}
              className={cls}
              aria-current={k === step ? 'step' : undefined}
              onClick={() => {
                onJump(k);
              }}
            >
              <span className="n">{s.num}</span>
              <b>{s.label}</b>
              <code>{s.code}</code>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
