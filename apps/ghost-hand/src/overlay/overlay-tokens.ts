// Overlay colors for both themes (design D12). Theme names match @ghost-run/ui: 'dark' and 'light'.
// Every color carries a Contrast_Pair against the scene background. The fg of a translucent
// element is the opaque color the viewer sees after the opacity below is applied to the background.

export type OverlayTheme = 'dark' | 'light';
export type OverlayPairRole = 'text' | 'graphic';

export interface ContrastPair {
  readonly id: string;
  readonly role: OverlayPairRole;
  readonly fg: string;
  readonly bg: string;
}

export interface OverlayColors {
  readonly background: string;
  readonly cabinet: string;
  readonly drawer: string;
  readonly vase: string;
  readonly baseArm: string;
  readonly ghostArm: string;
  readonly failedArm: string;
  readonly labelText: string;
  readonly failedLabelText: string;
}

export const OVERLAY_COLORS: Record<OverlayTheme, OverlayColors> = {
  dark: {
    background: '#14111c',
    cabinet: '#8d86a6',
    drawer: '#b4adc6',
    vase: '#ffc247',
    baseArm: '#d9d4e8',
    ghostArm: '#9fb0d8',
    failedArm: '#ff8585',
    labelText: '#ece8f4',
    failedLabelText: '#ff8585',
  },
  light: {
    background: '#faf7f2',
    cabinet: '#7a7390',
    drawer: '#565068',
    vase: '#7a4a00',
    baseArm: '#3b3552',
    ghostArm: '#4a5a8a',
    failedArm: '#b3261e',
    labelText: '#1f1b2e',
    failedLabelText: '#b3261e',
  },
};

/** Opacity of a normal ghost arm, of a failed arm at rest, and of a failed arm in reduced motion. */
export const OVERLAY_OPACITY = { ghost: 0.45, base: 0.9, failedReduced: 0.6 } as const;

/** The fade of a failed arm finishes within 1 second (Requirement 13.2). */
export const FADE_DURATION_MS = 800;

const PAIR_SPECS: readonly { key: keyof OverlayColors; role: OverlayPairRole }[] = [
  { key: 'cabinet', role: 'graphic' },
  { key: 'drawer', role: 'graphic' },
  { key: 'vase', role: 'graphic' },
  { key: 'baseArm', role: 'graphic' },
  { key: 'ghostArm', role: 'graphic' },
  { key: 'failedArm', role: 'graphic' },
  { key: 'labelText', role: 'text' },
  { key: 'failedLabelText', role: 'text' },
];

function buildPairs(theme: OverlayTheme): readonly ContrastPair[] {
  const colors = OVERLAY_COLORS[theme];
  return PAIR_SPECS.map(({ key, role }) => ({
    id: `${theme}:${key}|background`,
    role,
    fg: colors[key],
    bg: colors.background,
  }));
}

export const OVERLAY_CONTRAST_PAIRS: Record<OverlayTheme, readonly ContrastPair[]> = {
  dark: buildPairs('dark'),
  light: buildPairs('light'),
};
