// Static copy of sections 1 and 2: the skeleton parts, the six World functions,
// the six spec names, and the three costume cards (texts of the copy deck).
// No line count is written here; the sticker count comes from world-size.json.

import type { CostumeId } from './parts-matrix';

export interface SkeletonPart {
  name: string;
  line: string;
}

export const SKELETON_PARTS: readonly SkeletonPart[] = [
  { name: 'Mirror', line: 'Copy and compare' },
  { name: 'Ghost', line: 'Try the plan on the copy' },
  { name: 'Wards', line: 'Rules that say no' },
  { name: 'Candle', line: 'Go, ask, or stop' },
  { name: 'Blacklight', line: 'Find hidden instructions' },
  { name: 'Graveyard', line: 'Remember stopped plans' },
  { name: 'Kiro hook', line: 'Stop risky commands in Kiro' },
  { name: 'world-smith', line: 'A Kiro agent that builds worlds' },
];

export interface WorldFunction {
  name: string;
  line: string;
}

export const WORLD_FUNCTIONS: readonly WorldFunction[] = [
  { name: 'snapshot', line: 'copy reality' },
  { name: 'step', line: 'try one action' },
  { name: 'diff', line: 'what changed' },
  { name: 'render', line: 'draw it' },
  { name: 'fingerprint', line: 'prove reality is untouched' },
  { name: 'effectsOutside', line: 'what leaves the box' },
];

export const SPEC_NAMES: readonly string[] = [
  'core-contract',
  'ghost-runner',
  'wards',
  'possession',
  'ui-kit',
  'kiro-integration',
];

export interface CostumeCardData {
  id: CostumeId;
  name: string;
  /** The costume tag, for example "Hacker hoodie". */
  costume: string;
  /** Short visual detail of the costume, for the figure's description. */
  costumeDetail: string;
  world: string;
  /** The Kiro line, split so that the name can be shown as code. */
  provenance: { prefix: string; code: string };
  link: { text: string; href: string };
}

export const COSTUME_CARDS: readonly CostumeCardData[] = [
  {
    id: 'shell',
    name: 'Ghost Shell',
    costume: 'Hacker hoodie',
    costumeDetail: 'a >_ badge',
    world: 'Files + SQLite',
    provenance: { prefix: 'Kiro spec:', code: 'ghost-shell' },
    link: { text: 'Open Ghost Shell →', href: 'shell/' },
  },
  {
    id: 'hand',
    name: 'Ghost Hand',
    costume: 'Robot suit',
    costumeDetail: 'antenna, ear bolts, box body with lights, claw',
    world: 'Robot arm, 8 haunted copies',
    provenance: { prefix: 'Kiro spec:', code: 'ghost-hand' },
    link: { text: 'Open Ghost Hand →', href: 'hand/' },
  },
  {
    id: 'cloud',
    name: 'Ghost Cloud',
    costume: 'Cloud + bucket hat',
    costumeDetail: 'an orange "S3" hat',
    world: 'S3 buckets in memory',
    provenance: { prefix: 'Kiro agent:', code: 'world-smith' },
    link: { text: 'How it was made →', href: '#make' },
  },
];
