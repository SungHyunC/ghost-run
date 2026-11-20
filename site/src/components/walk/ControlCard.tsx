import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { WORLDS, type WorldId } from '../../config';
import { Icon } from '../art/Icon';

const WORLD_NAMES: Readonly<Record<WorldId, string>> = {
  shell: 'Ghost Shell',
  hand: 'Ghost Hand',
  cloud: 'Ghost Cloud',
};

export interface ControlCardProps {
  world: WorldId;
  onPick: (world: WorldId) => void;
  onReplay: () => void;
  /** True while the plan box shows a Fixed_Plan (the `rev` class of the card). */
  rev?: boolean;
  /** The plan box and the presets row. */
  children?: ReactNode;
}

/** The control card: the world tabs (roving tabindex, arrow keys), Replay, and the plan box in `children`. */
export function ControlCard({ world, onPick, onReplay, rev = false, children }: ControlCardProps) {
  const [rove, setRove] = useState<WorldId>(world);
  const tabs = useRef<Partial<Record<WorldId, HTMLButtonElement | null>>>({});

  // The roving stop follows the selected tab.
  useEffect(() => {
    setRove(world);
  }, [world]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = WORLDS.indexOf(rove);
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = (i + 1) % WORLDS.length;
        break;
      case 'ArrowLeft':
        next = (i + WORLDS.length - 1) % WORLDS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = WORLDS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const target = WORLDS[next];
    if (target === undefined) return;
    setRove(target);
    tabs.current[target]?.focus();
  };

  return (
    <div className={rev ? 'ctl rev' : 'ctl'}>
      <div className="ctl-top">
        <div className="tabs" role="tablist" aria-label="World" onKeyDown={onKeyDown}>
          {WORLDS.map((w) => (
            <button
              type="button"
              role="tab"
              className="tab"
              data-w={w}
              aria-selected={w === world}
              aria-controls="planbox"
              tabIndex={w === rove ? 0 : -1}
              key={w}
              ref={(el) => {
                tabs.current[w] = el;
              }}
              onFocus={() => {
                setRove(w);
              }}
              onClick={() => {
                onPick(w);
              }}
            >
              <Icon id="pumpkin" viewBox="0 0 64 58" />
              {WORLD_NAMES[w]}
            </button>
          ))}
        </div>
        <button type="button" className="ghostbtn" id="replay" onClick={onReplay}>
          ↻ Replay
        </button>
      </div>
      {children}
    </div>
  );
}
