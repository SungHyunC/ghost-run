// Showcase copy deck (pages-brief section C). Components read these values.

/** Number of render rules (the eleven render rules of the ui-kit spec). */
export const UI_RENDER_RULES = 11;

export const HERO_KICKER = "🦴 The skeleton's screen kit";
export const HERO_HEADING_LEAD = 'Every ghost-run app wears ';
export const HERO_HEADING_EM = 'the same screens';
export const HERO_HEADING_TAIL = '.';
export const HERO_TEXT = 'Worlds bring the data. The kit draws it, and never decides.';
export const HERO_CHIPS: readonly string[] = [
  'Used by Ghost Shell and Ghost Hand',
  `${UI_RENDER_RULES} render rules`,
];

export const PARTS_LABEL = 'Parts';

export type PartIconId = 'mirror' | 'candle' | 'blacklight' | 'thread' | 'tomb' | 'bulb';

export interface PartCard {
  readonly rowId: string;
  readonly icon: PartIconId;
  readonly name: string;
  readonly line: string;
}

export const PART_CARDS: readonly PartCard[] = [
  { rowId: 'p-mirror', icon: 'mirror', name: 'Mirror world', line: 'Reality vs. the copy' },
  { rowId: 'p-candle', icon: 'candle', name: 'Candle', line: 'Go, ask, or stop' },
  { rowId: 'p-blacklight', icon: 'blacklight', name: 'Blacklight', line: 'Hidden letters glow' },
  { rowId: 'p-thread', icon: 'thread', name: 'Red thread', line: 'Step → cause' },
  { rowId: 'p-grave', icon: 'tomb', name: 'Graveyard', line: 'Stopped plans rest here' },
  { rowId: 'p-lights', icon: 'bulb', name: 'Lights on', line: 'Same screens, light theme' },
];

export interface PartRowCopy {
  readonly id: string;
  /** Decorative number shown beside the heading. */
  readonly n: string;
  readonly heading: string;
  readonly lead: string;
  readonly bullets: readonly string[];
}

export const PART_ROWS: readonly PartRowCopy[] = [
  {
    id: 'p-mirror',
    n: '01',
    heading: 'Mirror world',
    lead: "Reality vs. the ghost's copy, change by change.",
    bullets: ['Losses in red.', 'Secret-like fields hidden.'],
  },
  {
    id: 'p-candle',
    n: '02',
    heading: 'Candle',
    lead: 'The verdict at a glance.',
    bullets: ['Pass: lit · Warn: flickering · Block: out', 'Claims show what this run proved.'],
  },
  {
    id: 'p-blacklight',
    n: '03',
    heading: 'Blacklight',
    lead: 'Turn it on: hidden letters glow.',
    bullets: ['Zero-width, direction marks, HTML comments.'],
  },
  {
    id: 'p-thread',
    n: '04',
    heading: 'Red thread',
    lead: 'From the blocked step to its cause.',
    bullets: ['Literal matches only. Not found is not safe.'],
  },
  {
    id: 'p-grave',
    n: '05',
    heading: 'Graveyard',
    lead: 'Every stopped plan rests here.',
    bullets: ['Open a tombstone for the seance.'],
  },
  {
    id: 'p-lights',
    n: '06',
    heading: 'Lights on',
    lead: 'Same screens for bright rooms.',
    bullets: ['Colors keep their meaning.'],
  },
  {
    id: 'p-controls',
    n: '+',
    heading: 'Base controls',
    lead: 'Buttons and inputs that fit the kit.',
    bullets: [],
  },
];

export const FOOTER_LEAD = 'The kit lives in ';
export const FOOTER_CODE = 'ui/';
export const FOOTER_TAIL = '.';
export const FOOTER_GALLERY_LABEL = 'Developer gallery →';
export const FOOTER_GALLERY_HREF = './gallery/';
