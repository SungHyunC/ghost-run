import type { SymbolId } from './Sprite';

export type { SymbolId };

export interface IconProps {
  id: SymbolId;
  viewBox: string;
  className?: string;
}

export function Icon({ id, viewBox, className }: IconProps) {
  return (
    <svg viewBox={viewBox} className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}
