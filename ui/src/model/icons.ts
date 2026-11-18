// The single IconId union of the kit. Pure data, no React. `components/art/Icon.tsx` imports
// this type and holds geometry only, so a prop string can never select an icon or inject markup.

export const ICON_IDS = [
  'candle-lit',
  'candle-flicker',
  'candle-out',
  'candle-unknown',
  'candle-idle',
  'check',
  'ban',
  'not-applicable',
  'cloud',
  'lamp',
  'bulb',
  'thread',
  'hidden-text',
  'warning',
  'link-changed',
  'state-created',
  'state-overwritten',
  'state-present',
  'state-absent',
  'chevron',
  'back',
] as const;

export type IconId = (typeof ICON_IDS)[number];

/** The five candle icons, one per Candle_State. */
export const CANDLE_ICON_IDS = ['candle-lit', 'candle-flicker', 'candle-out', 'candle-unknown', 'candle-idle'] as const satisfies readonly IconId[];
