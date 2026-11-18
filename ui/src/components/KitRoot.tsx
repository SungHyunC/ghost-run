import { useState } from 'react';
import type { KitRootProps } from '../types';
import { Icon } from './art/Icon';
import { Placeholder } from './Placeholder';

type ThemeName = 'dark' | 'light';

function LightsToggle(props: { theme: ThemeName; onToggle: () => void }) {
  const on = props.theme === 'light';
  return (
    <button type="button" role="switch" aria-checked={on} aria-label="Lights on" className="gk-toggle" onClick={props.onToggle}>
      <Icon id="bulb" />
      <span>{on ? 'Lights: on' : 'Lights: off'}</span>
    </button>
  );
}

/** Owns the theme. Children stay at one tree position, so a theme change never remounts them. Nothing is stored. */
export function KitRoot(props: KitRootProps) {
  const initial: unknown = props.initialTheme;
  const invalid = initial !== undefined && initial !== 'dark' && initial !== 'light';
  const [theme, setTheme] = useState<ThemeName>(initial === 'light' ? 'light' : 'dark');
  return (
    <div className="gk-root" data-theme={theme}>
      <header className="gk-header">
        <LightsToggle theme={theme} onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} />
      </header>
      {invalid ? <Placeholder name="KitRoot" /> : null}
      {props.children}
    </div>
  );
}
