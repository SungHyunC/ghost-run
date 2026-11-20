import { REPO_URL } from '../config';
import { Icon } from './art/Icon';

export type NavCurrent = 'home';

interface NavLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

const LINKS: readonly NavLink[] = [
  { key: 'home', label: 'Home', href: './' },
  { key: 'shell', label: 'Ghost Shell', href: 'shell/' },
  { key: 'hand', label: 'Ghost Hand', href: 'hand/' },
  { key: 'kit', label: 'UI Kit', href: 'kit/' },
  { key: 'github', label: 'GitHub', href: REPO_URL, external: true },
];

export function Nav({ current }: { current: NavCurrent }) {
  return (
    <nav className="nav">
      <div className="logo">
        <Icon id="boo" viewBox="0 0 120 130" />
        Ghost Run<span>+</span>
      </div>
      <div className="nav-links">
        {LINKS.map((l) => {
          const isCurrent = l.key === current;
          return (
            <a
              key={l.key}
              href={l.href}
              className={isCurrent ? 'on' : undefined}
              aria-current={isCurrent ? 'page' : undefined}
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
