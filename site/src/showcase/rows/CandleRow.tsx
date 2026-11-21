import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Candle, KitRoot } from '@ghost-run/ui';
import { CANDLE_STATES } from '../sample-data';

const PANEL_ID = 'candle-panel';
const tabId = (id: string): string => `candle-tab-${id}`;

export function CandleRow() {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = CANDLE_STATES[index] ?? CANDLE_STATES[0];
  if (selected === undefined) return null;

  const select = (next: number, focus: boolean): void => {
    setIndex(next);
    if (focus) tabs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    const last = CANDLE_STATES.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Enter' || e.key === ' ') next = i;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <KitRoot>
      <div className="ktabs" role="tablist" aria-label="Candle states">
        {CANDLE_STATES.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(s.id)}
            className={i === index ? 'ktab on' : 'ktab'}
            aria-selected={i === index}
            aria-controls={PANEL_ID}
            tabIndex={i === index ? 0 : -1}
            onClick={() => {
              select(i, false);
            }}
            onKeyDown={(e) => {
              onKeyDown(e, i);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(selected.id)}>
        <Candle
          {...(selected.verdict === undefined ? {} : { verdict: selected.verdict })}
          {...(selected.claims === undefined ? {} : { claims: selected.claims })}
        />
      </div>
    </KitRoot>
  );
}
