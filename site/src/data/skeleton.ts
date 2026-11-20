// Static copy of sections 1 and 2: the skeleton parts, the six World functions,
// the six spec names, and the three costume cards. No line count is written here;
// the Cloud world line carries the token LINES_TOKEN that the page fills from world-size.json.

import type { CostumeId } from './parts-matrix';

export interface SkeletonPart {
  name: string;
  line: string;
  folders: readonly string[];
}

export const SKELETON_PARTS: readonly SkeletonPart[] = [
  { name: 'Mirror', line: 'Copies the world. Shows before and after.', folders: ['core/', 'ui/'] },
  { name: 'Ghost', line: 'Runs the plan on the copy, in a Docker box for real files.', folders: ['core/', 'ghost-runner/'] },
  { name: 'Wards', line: 'Your rules in wards.yaml: what must never happen.', folders: ['core/', 'wards-config/'] },
  { name: 'Candle', line: 'Lit: go. Flickering: ask a human. Out: stop.', folders: ['ui/'] },
  { name: 'Blacklight', line: 'Finds instructions hidden in what the agent read.', folders: ['core/', 'ui/'] },
  { name: 'Graveyard', line: 'Keeps every stopped plan and the reason.', folders: ['ui/'] },
  { name: 'Kiro hook', line: 'ghost-gate stops a risky command before Kiro runs it.', folders: ['integrations/'] },
  { name: 'world-smith', line: 'A Kiro agent that builds a new world with you.', folders: ['.kiro/agents/'] },
];

export interface WorldFunction {
  name: string;
  line: string;
}

export const WORLD_FUNCTIONS: readonly WorldFunction[] = [
  { name: 'snapshot', line: 'copy reality' },
  { name: 'step', line: 'try one action on the copy' },
  { name: 'diff', line: 'what changed' },
  { name: 'render', line: 'draw it for the screens' },
  { name: 'fingerprint', line: 'prove reality stayed the same' },
  { name: 'effectsOutside', line: 'what would leave the box' },
];

export const SPEC_NAMES: readonly string[] = [
  'core-contract',
  'ghost-runner',
  'wards',
  'possession',
  'ui-kit',
  'kiro-integration',
];

/** Replaced by the rounded Ghost Cloud line count when the card is rendered. */
export const LINES_TOKEN = '{lines}';

export interface CostumeCardData {
  id: CostumeId;
  tag: string;
  name: string;
  costume: string;
  /** Short visual detail of the costume, for the figure's description. */
  costumeDetail: string;
  world: string;
  folder: string;
  usedTitle: string;
  provenance: { prefix: string; code: string };
  link: { text: string; href: string };
}

export const COSTUME_CARDS: readonly CostumeCardData[] = [
  {
    id: 'shell',
    tag: 'App 1',
    name: 'Ghost Shell',
    costume: 'Costume: hacker hoodie',
    costumeDetail: 'a >_ badge',
    world: 'World: files + SQLite in the browser',
    folder: 'worlds/playground-shell',
    usedTitle: 'Skeleton parts on its screen',
    provenance: { prefix: 'Built with the Kiro spec', code: 'ghost-shell' },
    link: { text: 'Open Ghost Shell →', href: 'shell/' },
  },
  {
    id: 'hand',
    tag: 'App 2',
    name: 'Ghost Hand',
    costume: 'Costume: robot suit',
    costumeDetail: 'antenna, ear bolts, box body with lights, claw',
    world: 'World: a MuJoCo robot arm, 8 haunted copies',
    folder: 'worlds/drawer-arm',
    usedTitle: 'Skeleton parts on its screen',
    provenance: { prefix: 'Built with the Kiro spec', code: 'ghost-hand' },
    link: { text: 'Open Ghost Hand →', href: 'hand/' },
  },
  {
    id: 'cloud',
    tag: '3rd world',
    name: 'Ghost Cloud',
    costume: 'Costume: a cloud and a bucket hat',
    costumeDetail: 'an orange "S3" hat',
    world: `World: S3 buckets in memory, about ${LINES_TOKEN} lines`,
    folder: 'worlds/ghost-cloud',
    usedTitle: 'Skeleton parts it uses (no screen yet)',
    provenance: { prefix: 'Built by the Kiro agent', code: 'world-smith' },
    link: { text: 'How it was made →', href: '#make' },
  },
];
