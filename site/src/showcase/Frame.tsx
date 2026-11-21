import type { ReactNode } from 'react';

/** A device frame: a bar with three decorative dots (no text) and the body. */
export function Frame({ children }: { children?: ReactNode }) {
  return (
    <figure className="frame">
      <div className="frame-bar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="frame-body">{children}</div>
    </figure>
  );
}
