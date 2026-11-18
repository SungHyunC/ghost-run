import type { ReactNode } from 'react';
import type { IconId } from '../../model/icons';

// Geometry only. The id comes from the fixed IconId union, so a prop string can never select
// an icon or inject markup. All shapes are original paths drawn for this package.

const CANDLE_BODY = <path d="M9 13h6v8H9zM7 21h10" />;
const CANDLE_WICK = <path d="M12 13v-1.5" />;
const CANDLE_FLAME = <path d="M12 3.2c2.2 2.4 3 4 3 5.4a3 3 0 0 1-6 0c0-1.4.8-3 3-5.4z" />;

const GEOMETRY: Record<IconId, ReactNode> = {
  'candle-lit': (
    <>
      {CANDLE_BODY}
      {CANDLE_WICK}
      {CANDLE_FLAME}
    </>
  ),
  'candle-flicker': (
    <>
      {CANDLE_BODY}
      {CANDLE_WICK}
      {CANDLE_FLAME}
      <path d="M5.5 6l2 1.2M18.5 6l-2 1.2M4.5 10h2M17.5 10h2" />
    </>
  ),
  'candle-out': (
    <>
      {CANDLE_BODY}
      {CANDLE_WICK}
      <path d="M12 11.5c-2-1.2-2-2.6 0-3.8s2-2.6 0-3.8" />
    </>
  ),
  'candle-unknown': (
    <>
      {CANDLE_BODY}
      {CANDLE_WICK}
      <circle cx="12" cy="7.5" r="3.2" strokeDasharray="2 1.6" />
    </>
  ),
  'candle-idle': (
    <>
      {CANDLE_BODY}
      {CANDLE_WICK}
      <path d="M10 8h4" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.4 6.4l11.2 11.2" />
    </>
  ),
  'not-applicable': (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" />
    </>
  ),
  cloud: <path d="M7 18a4 4 0 0 1-.6-7.96 5 5 0 0 1 9.6-1.54A4.8 4.8 0 0 1 17 18H7z" />,
  lamp: (
    <>
      <path d="M5 6h14v5H5z" />
      <path d="M8 11v3M12 11v5M16 11v3" />
    </>
  ),
  bulb: <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.4 1-1.9A6 6 0 0 0 12 3zM10 18h4M10 21h4" />,
  thread: (
    <>
      <path d="M4 18c4 0 4-12 8-12s4 12 8 12" />
      <circle cx="4" cy="18" r="1.5" />
      <circle cx="20" cy="18" r="1.5" />
    </>
  ),
  'hidden-text': (
    <>
      <path d="M4 8h10M4 12h16" />
      <path d="M4 16h12" strokeDasharray="2 2" />
    </>
  ),
  warning: <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />,
  'link-changed': <path d="M9 8h-2a4 4 0 0 0 0 8h2M15 8h2a4 4 0 0 1 0 8h-2M9 12h6" />,
  'state-created': <circle cx="12" cy="12" r="7" />,
  'state-overwritten': <path d="M5 9h14M5 15h14" />,
  'state-present': (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  'state-absent': <circle cx="12" cy="12" r="7" strokeDasharray="2 2" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  back: <path d="M15 5l-7 7 7 7" />,
};

export interface IconProps {
  readonly id: IconId;
  /** Marks a chevron as open (rotated by CSS). */
  readonly open?: boolean;
}

/** A decorative inline icon. Meaning is always carried by adjacent text. */
export function Icon({ id, open }: IconProps) {
  const className = id === 'chevron' ? 'gk-icon gk-chevron' : 'gk-icon';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={id}
      data-open={id === 'chevron' && open !== undefined ? String(open) : undefined}
    >
      {GEOMETRY[id]}
    </svg>
  );
}
