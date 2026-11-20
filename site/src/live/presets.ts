// The nine Presets and four Fixed_Plans of the live section.
// Inputs that match a repository file are read from that file, never retyped.

import shellDropTable from '../../../apps/ghost-shell/plans/scenario-1.json?raw';
import shellDropTableFixed from '../../../apps/ghost-shell/plans/scenario-1-fixed.json?raw';
import shellRemoveDirs from '../../../apps/ghost-shell/plans/scenario-2.json?raw';
import shellRemoveDirsFixed from '../../../apps/ghost-shell/plans/scenario-2-fixed.json?raw';
import shellNpmTest from '../../../apps/ghost-shell/plans/scenario-4.json?raw';
import handFast from '../../../apps/ghost-hand/plans/first.plan.json?raw';
import handSlow from '../../../apps/ghost-hand/plans/revised.plan.json?raw';
import cloudProtected from '../../../worlds/ghost-cloud/demo/01-delete-protected-bucket.txt?raw';
import cloudTemporary from '../../../worlds/ghost-cloud/demo/03-delete-temporary-bucket.txt?raw';
import { parsePlanFile as parseHandPlan } from '../../../apps/ghost-hand/src/plan/plan-file';
import { parsePlanFile as parseShellPlan } from '../../../apps/ghost-shell/src/plan/plan-file';
import type { WorldId } from '../data/types';
import { normalizeSliders } from './input';
import type { LiveInput } from './types';

export interface Preset {
  id: string;
  label: string;
  input: LiveInput;
  /** The Fixed_Plan input, or null when the Preset has none. */
  fix: LiveInput | null;
}

type ShellInput = Extract<LiveInput, { world: 'shell' }>;
type CloudInput = Extract<LiveInput, { world: 'cloud' }>;
type HandInput = Extract<LiveInput, { world: 'hand' }>;

function shellFile(name: string, text: string): ShellInput {
  const parsed = parseShellPlan(text);
  if (!parsed.ok) throw new Error(`presets: ${name} is not a valid Ghost Shell plan file`);
  return { world: 'shell', actions: parsed.plan.actions.map((a) => a.command) };
}

/** Cloud demo files: trim, drop empty lines. */
function cloudFile(text: string): CloudInput {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return { world: 'cloud', lines };
}

/** Hand values come from the grasp action (force) and the pull action (distance, speed). */
function handFile(name: string, text: string): HandInput {
  const parsed = parseHandPlan(text);
  if (!parsed.ok) throw new Error(`presets: ${name} is not a valid Ghost Hand plan file`);
  let force: number | undefined;
  let pull: { distance: number; speed: number } | undefined;
  for (const a of parsed.plan.actions) {
    if (a.type === 'grasp') force = a.force;
    else if (a.type === 'pull') pull = { distance: a.distance, speed: a.speed };
  }
  if (force === undefined || pull === undefined) throw new Error(`presets: ${name} has no grasp or pull action`);
  return { world: 'hand', speed: pull.speed, force, distance: pull.distance };
}

const SHELL_DROP = shellFile('scenario-1.json', shellDropTable);
const SHELL_RM = shellFile('scenario-2.json', shellRemoveDirs);
const SHELL_NPM = shellFile('scenario-4.json', shellNpmTest);
const HAND_FAST = handFile('first.plan.json', handFast);
const HAND_SLOW = handFile('revised.plan.json', handSlow);
const CLOUD_PROD = cloudFile(cloudProtected);
const CLOUD_TMP = cloudFile(cloudTemporary);

/** The brief's two Presets that have no file. */
const HAND_STRONG: HandInput = { world: 'hand', speed: 0.3, force: 38, distance: 0.2 };
const CLOUD_PUBLIC: CloudInput = {
  world: 'cloud',
  lines: ['aws s3api put-bucket-acl --bucket prod-assets --acl public-read'],
};

export const PRESETS: Record<WorldId, Preset[]> = {
  shell: [
    {
      id: 'shell-drop-users',
      label: 'DROP TABLE users',
      input: SHELL_DROP,
      fix: shellFile('scenario-1-fixed.json', shellDropTableFixed),
    },
    {
      id: 'shell-rm-data-build',
      label: 'rm -rf ./data ./build',
      input: SHELL_RM,
      fix: shellFile('scenario-2-fixed.json', shellRemoveDirsFixed),
    },
    { id: 'shell-npm-test', label: 'npm test', input: SHELL_NPM, fix: null },
  ],
  hand: [
    { id: 'hand-fast-pull', label: 'fast pull', input: HAND_FAST, fix: HAND_SLOW },
    { id: 'hand-slow-pull', label: 'slow pull, gentle grip', input: HAND_SLOW, fix: null },
    { id: 'hand-strong-grip', label: 'strong grip', input: HAND_STRONG, fix: null },
  ],
  cloud: [
    { id: 'cloud-delete-prod', label: 'delete prod-assets', input: CLOUD_PROD, fix: CLOUD_TMP },
    { id: 'cloud-make-public', label: 'make it public', input: CLOUD_PUBLIC, fix: null },
    { id: 'cloud-delete-tmp', label: 'delete tmp-build-cache', input: CLOUD_TMP, fix: null },
  ],
};

/** The four Fixed_Plans, keyed by the id of the Preset they repair. */
export const FIXED: Record<string, LiveInput> = Object.fromEntries(
  Object.values(PRESETS)
    .flat()
    .flatMap((p) => (p.fix === null ? [] : [[p.id, p.fix] as const])),
);

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** A Preset is known only while the box equals its input: text equal, or all three slider values equal after rounding. */
export function isKnown(box: LiveInput, preset: Preset): boolean {
  const p = preset.input;
  if (box.world !== p.world) return false;
  if (box.world === 'shell' && p.world === 'shell') return sameList(box.actions, p.actions);
  if (box.world === 'cloud' && p.world === 'cloud') return sameList(box.lines, p.lines);
  if (box.world === 'hand' && p.world === 'hand') {
    const a = normalizeSliders(box);
    const b = normalizeSliders(p);
    return (
      a.ok &&
      b.ok &&
      a.values.speed === b.values.speed &&
      a.values.force === b.values.force &&
      a.values.distance === b.values.distance
    );
  }
  return false;
}
