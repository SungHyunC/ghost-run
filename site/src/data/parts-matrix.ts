// The one data object that says which App_Parts each costume uses (Requirement 7).
// Checked against the imports by tests/unit/parts-matrix.property.test.ts.

import type { AppPart } from './types';

export type CostumeId = 'shell' | 'hand' | 'cloud';

/** The six App_Parts in chip order. */
export const PART_NAMES: readonly AppPart[] = ['mirror', 'ghost', 'wards', 'candle', 'blacklight', 'graveyard'];

export const PARTS_MATRIX: Readonly<Record<CostumeId, Readonly<Record<AppPart, boolean>>>> = {
  shell: { mirror: true, ghost: true, wards: true, candle: true, blacklight: true, graveyard: true },
  hand: { mirror: false, ghost: true, wards: true, candle: true, blacklight: false, graveyard: true },
  cloud: { mirror: false, ghost: true, wards: true, candle: false, blacklight: false, graveyard: false },
};
