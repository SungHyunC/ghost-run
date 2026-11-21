import type { ReactNode } from 'react';
import { Frame } from './Frame';

export interface PartRowProps {
  id: string;
  n: string;
  heading: string;
  lead: string;
  bullets: readonly string[];
  /** Puts the text on the right (alternating rows). */
  flip: boolean;
  children?: ReactNode;
}

export function PartRow({ id, n, heading, lead, bullets, flip, children }: PartRowProps) {
  return (
    <section className={flip ? 'kpart flip' : 'kpart'} id={id} aria-labelledby={`${id}-h`}>
      <div className="kp-text">
        <span className="kp-n" aria-hidden="true">
          {n}
        </span>
        <h2 id={`${id}-h`}>{heading}</h2>
        <p className="kp-lead">{lead}</p>
        {bullets.length > 0 ? (
          <ul>
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Frame>{children}</Frame>
    </section>
  );
}
