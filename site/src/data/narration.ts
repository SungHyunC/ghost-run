// Narration of the walkthrough: five templates per world, as typed segments (no HTML strings).
// Wording is that of the mockup. Every number is filled from the world record.

import type { WorldId, WorldRecord } from './types';
import type { Segment } from '../engine/types';
import { formatCount } from '../engine/format';

const t = (text: string): Segment => ({ kind: 'text', text });
const b = (text: string): Segment => ({ kind: 'b', text });
const c = (text: string): Segment => ({ kind: 'code', text });

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** Number word for small counts ("Eight"); falls back to digits above ten. */
function word(n: number): string {
  return WORDS[n] ?? String(n);
}

function num(v: number | string | undefined): number {
  return typeof v === 'number' ? v : Number(v);
}

/** The first integer in a check label, such as the 95 in "success, at least 95%". */
function labelNumber(label: string | undefined): number {
  const m = /(\d+)/.exec(label ?? '');
  return m ? Number(m[1]) : 0;
}

type Template = (r: WorldRecord) => Segment[];

const SHELL: Template[] = [
  () => [b('Copy.'), t(' I wave my wand and copy '), c('app.db'), t(' and your files. Reality stays exactly as it is.')],
  (r) => [
    b('Run.'),
    t(` I type the agent's command on my copy… poof! ${formatCount(num(r.plan.facts['rowsLost']))} users are gone, but only in the copy.`),
  ],
  (r) => [
    b('Judge.'),
    t(' Ward '),
    c(r.ward.id),
    t(` allows ${labelNumber(r.plan.checks[0]?.label)} lost rows. My copy lost ${formatCount(num(r.plan.facts['rowsLost']))}. Nothing left the box.`),
  ],
  () => [b('Verdict.'), t(" I blow the candle out: blocked. Reality's fingerprint still matches.")],
  (r) => [
    b('Fix and go.'),
    t(` The agent backs up first and only marks users as deleted. ${formatCount(num(r.fixed.facts['rowsLost']))} rows lost, so the candle is lit.`),
  ],
];

const HAND: Template[] = [
  (r) => [
    b('Copy.'),
    t(` I copy the arm, the drawer and the vase into ${num(r.plan.facts['total'])} haunted variants: slippery, sticky, heavy, laggy…`),
  ],
  (r) => [
    b('Run.'),
    t(` ${word(num(r.plan.facts['total']))} ghost arms try `),
    c(r.plan.display),
    t(` at once. ${word(num(r.plan.facts['total']) - num(r.plan.facts['succeeded']))} of them can't finish.`),
  ],
  (r) => [
    b('Judge.'),
    t(' Ward '),
    c(r.ward.id),
    t(
      ` needs ${labelNumber(r.plan.checks[0]?.label)}% success. We got ${num(r.plan.facts['succeeded'])} of ${num(r.plan.facts['total'])}. The force and the vase were fine.`,
    ),
  ],
  () => [b('Verdict.'), t(' I blow the candle out: blocked. The real arm stays still.')],
  (r) => [
    b('Fix and go.'),
    t(' New plan: '),
    c(r.fixed.display),
    t(
      `. All ${num(r.fixed.facts['total'])} ghosts succeed under ${labelNumber(r.fixed.checks[1]?.label)} N, so the candle is lit.`,
    ),
  ],
];

const CLOUD: Template[] = [
  (r) => {
    const buckets = r.reality.kind === 'cloud' ? r.reality.buckets : [];
    const objects = buckets.reduce((sum, bk) => sum + bk.objects.length, 0);
    return [b('Copy.'), t(` I copy ${buckets.length} buckets and ${objects} objects into memory. Nothing talks to AWS.`)];
  },
  (r) => [
    b('Run.'),
    t(" I run the agent's command on my copy… poof! "),
    c(String(r.plan.facts['removedBuckets'])),
    t(` and its ${num(r.plan.facts['objectsRemoved'])} objects are gone, in the copy only.`),
  ],
  (r) => [
    b('Judge.'),
    t(' Ward '),
    c(r.ward.id),
    t(' says never delete '),
    c(String(r.plan.checks[0]?.label.replace('never delete ', ''))),
    t('. Nothing left the box.'),
  ],
  (r) => [
    b('Verdict.'),
    t(' I blow the candle out: blocked. The real '),
    c(String(r.plan.facts['removedBuckets'])),
    t(' is untouched.'),
  ],
  (r) => [
    b('Fix and go.'),
    t(' The agent meant the build cache. '),
    c(String(r.fixed.facts['removedBuckets'])),
    t(' is not protected, so the candle is lit.'),
  ],
];

export const NARRATION: Record<WorldId, readonly Template[]> = { shell: SHELL, hand: HAND, cloud: CLOUD };

/** The narration of step `step` (0 to 4) of one world, with its numbers taken from the record. */
export function narration(record: WorldRecord, step: number): Segment[] {
  const template = NARRATION[record.id][step];
  if (!template) throw new Error(`No narration for world ${record.id}, step ${step}`);
  return template(record);
}
