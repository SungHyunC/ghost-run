// Single source of color for the kit. styles/theme.css mirrors these values.
export type Theme = 'dark' | 'light';

export interface ThemeTokens {
  [name: string]: string;
}

export type PairRole = 'text' | 'large-text' | 'graphic';

export interface ContrastPair {
  id: string;
  role: PairRole;
  fg: string;
  bg: string;
  /** Compositing chain, bottom layer first, ending with the layer named by `bg`. */
  backdrop: readonly string[];
}

export const THEMES: Record<Theme, ThemeTokens> = {
  dark: {
    '--gk-bg': '#14111c',
    '--gk-surface': '#1d1928',
    '--gk-fog': 'rgba(176,170,204,0.10)',
    '--gk-text': '#ece8f4',
    '--gk-muted': '#b4adc6',
    '--gk-pass': '#fff1d6',
    '--gk-warn': '#ffc247',
    '--gk-block': '#ff8585',
    '--gk-line': '#8d86a6',
    '--gk-focus': '#8ab4ff',
    '--gk-bl-fill': '#b8ff5c',
    '--gk-bl-ink': '#14111c',
    '--gk-bl-edge': '#b8ff5c',
    '--gk-flame': '#fff1d6',
    '--gk-smoke': '#8d86a6',
  },
  light: {
    '--gk-bg': '#faf7f2',
    '--gk-surface': '#ffffff',
    '--gk-fog': 'rgba(90,80,130,0.08)',
    '--gk-text': '#1f1b2e',
    '--gk-muted': '#565068',
    '--gk-pass': '#3b3552',
    '--gk-warn': '#7a4a00',
    '--gk-block': '#b3261e',
    '--gk-line': '#7a7390',
    '--gk-focus': '#1f4fd1',
    '--gk-bl-fill': '#d6ff3d',
    '--gk-bl-ink': '#1f1b2e',
    '--gk-bl-edge': '#1f1b2e',
    '--gk-flame': '#fff1d6',
    '--gk-smoke': '#7a7390',
  },
};

/** Fills only; never carry text or a shape alone. In no contrast pair. */
export const DECORATIVE_TOKENS: readonly string[] = ['--gk-flame', '--gk-smoke'];

interface Backdrop {
  readonly bg: string;
  readonly chain: readonly string[];
}

const BACKDROPS: readonly Backdrop[] = [
  { bg: '--gk-bg', chain: ['--gk-bg'] },
  { bg: '--gk-surface', chain: ['--gk-surface'] },
  { bg: '--gk-fog', chain: ['--gk-surface', '--gk-fog'] },
];

const FOREGROUNDS: readonly { fg: string; role: PairRole }[] = [
  { fg: '--gk-text', role: 'text' },
  { fg: '--gk-muted', role: 'text' },
  { fg: '--gk-pass', role: 'text' },
  { fg: '--gk-warn', role: 'text' },
  { fg: '--gk-block', role: 'text' },
  { fg: '--gk-line', role: 'graphic' },
  { fg: '--gk-focus', role: 'graphic' },
  { fg: '--gk-bl-edge', role: 'graphic' },
];

function buildPairs(): readonly ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const { fg, role } of FOREGROUNDS) {
    for (const b of BACKDROPS) {
      pairs.push({ id: `${fg}|${b.bg}`, role, fg, bg: b.bg, backdrop: b.chain });
    }
  }
  pairs.push({
    id: '--gk-bl-ink|--gk-bl-fill',
    role: 'text',
    fg: '--gk-bl-ink',
    bg: '--gk-bl-fill',
    backdrop: ['--gk-bl-fill'],
  });
  return pairs;
}

export const CONTRAST_PAIRS: Record<Theme, readonly ContrastPair[]> = {
  dark: buildPairs(),
  light: buildPairs(),
};
