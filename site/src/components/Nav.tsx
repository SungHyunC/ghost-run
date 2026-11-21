import type { MouseEvent } from 'react';
import { REPO_URL } from '../config';
import { Icon } from './art/Icon';

export type NavCurrent = 'home' | 'kit';

interface NavLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

function links(root: './' | '../'): readonly NavLink[] {
  return [
    { key: 'home', label: 'Home', href: root },
    { key: 'shell', label: 'Ghost Shell', href: root === './' ? 'shell/' : '../shell/' },
    { key: 'hand', label: 'Ghost Hand', href: root === './' ? 'hand/' : '../hand/' },
    { key: 'kit', label: 'UI Kit', href: root === './' ? 'kit/' : './' },
    { key: 'github', label: 'GitHub', href: REPO_URL, external: true },
  ];
}

export interface NavProps {
  current: NavCurrent;
  /** `'./'` on `/`, `'../'` on `/kit/`. */
  root?: './' | '../';
  /** Turns to the cover instead of following the Home link (landing page only). */
  onHome?: (e: MouseEvent) => void;
}

export function Nav({ current, root = './', onHome }: NavProps) {
  return (
    <nav className="nav">
      <div className="logo">
        <Icon id="boo" viewBox="0 0 120 130" />
        Ghost Run<span>+</span>
      </div>
      <div className="nav-links">
        {links(root).map((l) => {
          const isCurrent = l.key === current;
          return (
            <a
              key={l.key}
              href={l.href}
              className={isCurrent ? 'on' : undefined}
              aria-current={isCurrent ? 'page' : undefined}
              {...(l.key === 'home' && onHome !== undefined ? { onClick: onHome } : {})}
              {...(l.external ? { rel: 'noopener noreferrer' } : {})}
            >
              {l.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
