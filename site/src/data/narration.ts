// Narration of the walkthrough: templates per world, Outcome, and step, as typed segments (no HTML strings).
// Wording is that of the mockup. Every number is filled from the world record, and a sentence names a
// fact only when the fact exists in the record. The generic fallback names only the verdict and the ward ids.

import type { PlanRecord, WorldId, WorldRecord } from './types';
import type { Segment } from '../engine/types';
import { formatCount, formatForce, formatRate } from '../engine/format';

const t = (text: string): Segment => ({ kind: 'text', text });
const b = (text: string): Segment => ({ kind: 'b', text });
const c = (text: string): Segment => ({ kind: 'code', text });

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** Number word for small counts ("Eight"); falls back to digits above ten. */
function word(n: number): string {
  return WORDS[n] ?? String(n);
}

/** A numeric fact of a plan, or undefined when it is missing. */
function fact(plan: PlanRecord, key: string): number | undefined {
  const v = plan.facts[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** A non-empty text fact of a plan, or undefined. */
function textFact(plan: PlanRecord, key: string): string | undefined {
  const v = plan.facts[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** The first integer in a check label, such as the 95 in "success, at least 95%"; undefined when none. */
function labelNumber(label: string | undefined): number | undefined {
  const m = /(\d+)/.exec(label ?? '');
  return m ? Number(m[1]) : undefined;
}

/** "a,b" -> "a, b". */
function names(list: string): string {
  return list.split(',').join(', ');
}

/** The plan that decides the end of the run: the fixed plan when it ran, else the first plan. */
function finalPlan(r: WorldRecord): PlanRecord {
  return r.outcome === 'block-fixed' && r.fixed !== null ? r.fixed : r.plan;
}

/** The tail of a "fix and go" sentence, by the verdict of the final plan. */
function verdictTail(plan: PlanRecord): string {
  if (!plan.p1.equal) return ', but the isolation check failed, so the candle stays out.';
  if (plan.verdict === 'pass') return ', so the candle is lit.';
  if (plan.verdict === 'warn') return ', so a human has to decide.';
  return ', but a ward still blocks it, so the candle stays out.';
}

/** Check rows after the headline rows of a world: one per extra violated ward, with the engine's reason. */
function extraRows(plan: PlanRecord, headlineRows: number): Segment[] {
  const out: Segment[] = [];
  for (const row of plan.checks.slice(headlineRows)) {
    out.push(t(' Also ward '), c(row.label), t(`: ${row.measured}.`));
  }
  return out;
}

/** What left the box: nothing, or the destinations that the world observed. */
function outsideTail(plan: PlanRecord): Segment[] {
  if (plan.effectsOutside.length === 0) return [t(' Nothing left the box.')];
  return [t(' It tried to reach '), c(plan.effectsOutside.join(', ')), t(', which I only watched.')];
}

/** The sentence that follows a verdict about the fingerprints of reality. */
function fingerprintSentence(plan: PlanRecord): string {
  return plan.p1.equal
    ? " Reality's fingerprint still matches."
    : ' The isolation check failed: the fingerprints differ, so I do not trust this run.';
}

/** Ward ids that the judge step names: the violated ones, else the headline ward. */
function wardIds(r: WorldRecord, plan: PlanRecord): string[] {
  return plan.violatedWardIds.length > 0 ? plan.violatedWardIds : [r.ward.id];
}

/** The generic judge sentence: only the verdict and the ward ids. */
function genericJudge(r: WorldRecord, plan: PlanRecord): Segment[] {
  const out: Segment[] = [b('Judge.'), t(' Ward ')];
  wardIds(r, plan).forEach((id, k) => {
    if (k > 0) out.push(t(', '));
    out.push(c(id));
  });
  out.push(t(` says ${plan.verdict}.`));
  return out;
}

/** The generic run sentence: names nothing of the run. */
const GENERIC_RUN: Segment[] = [b('Run.'), t(' I run the plan on my copy.')];

// Step 1 (Copy)

function copyStep(r: WorldRecord): Segment[] {
  switch (r.id) {
    case 'shell': {
      const hasDb = r.reality.kind === 'shell' && r.reality.tables.length > 0;
      return hasDb
        ? [b('Copy.'), t(' I wave my wand and copy '), c('app.db'), t(' and your files. Reality stays exactly as it is.')]
        : [b('Copy.'), t(' I wave my wand and copy your files. Reality stays exactly as it is.')];
    }
    case 'hand': {
      const total = fact(r.plan, 'total');
      return total === undefined
        ? [b('Copy.'), t(' I copy the arm, the drawer and the vase into haunted variants.')]
        : [b('Copy.'), t(` I copy the arm, the drawer and the vase into ${total} haunted variants: slippery, sticky, heavy, laggy…`)];
    }
    case 'cloud': {
      const buckets = r.reality.kind === 'cloud' ? r.reality.buckets : [];
      const objects = buckets.reduce((sum, bk) => sum + bk.objects.length, 0);
      return [b('Copy.'), t(` I copy ${buckets.length} buckets and ${objects} objects into memory. Nothing talks to AWS.`)];
    }
  }
}

// Step 2 (Run)

function shellRun(r: WorldRecord): Segment[] {
  const plan = r.plan;
  const after = plan.copyAfter;
  const rowsLost = fact(plan, 'rowsLost');
  const gone = fact(plan, 'entriesGone');
  const added = fact(plan, 'entriesNew');
  if (rowsLost === undefined && gone === undefined && added === undefined) return GENERIC_RUN;

  const before = r.reality.kind === 'shell' ? r.reality.tables : [];
  const emptied =
    after.kind === 'shell'
      ? after.tables.filter((tb) => tb.state === 'dropped' || tb.rows < (before.find((x) => x.name === tb.name)?.rows ?? 0))
      : [];
  if (rowsLost !== undefined && rowsLost > 0 && emptied.some((tb) => tb.name === 'users')) {
    return [b('Run.'), t(` I type the agent's command on my copy… poof! ${formatCount(rowsLost)} users are gone, but only in the copy.`)];
  }
  const parts: string[] = [];
  if (rowsLost !== undefined && rowsLost > 0 && emptied.length > 0) parts.push(`${formatCount(rowsLost)} rows are gone`);
  if (gone !== undefined && gone > 0) parts.push(`${formatCount(gone)} entries are gone`);
  if (added !== undefined && added > 0) parts.push(`${formatCount(added)} new entries appear`);
  const out: Segment[] = [b('Run.')];
  if (parts.length === 0) out.push(t(' I run the plan on my copy. Nothing in the copy changed.'));
  else out.push(t(` I run the plan on my copy… poof! ${parts.join(', ')}, but only in the copy.`));
  if (plan.effectsOutside.length > 0) out.push(t(' It also reached for '), c(plan.effectsOutside.join(', ')), t(', which I only watched.'));
  return out;
}

function handRun(r: WorldRecord): Segment[] {
  const plan = r.plan;
  const total = fact(plan, 'total');
  const succeeded = fact(plan, 'succeeded');
  if (total === undefined || succeeded === undefined) return GENERIC_RUN;
  const failed = total - succeeded;
  const tail =
    failed === 0 ? ' All of them finish.' : failed === 1 ? " One of them can't finish." : ` ${word(failed)} of them can't finish.`;
  const out: Segment[] = [b('Run.'), t(` ${word(total)} ghost arms try the pull at once (`), c(plan.display), t(`).${tail}`)];
  const joints = textFact(plan, 'jointLimitVariants');
  if (joints !== undefined) {
    const n = joints.split(',').length;
    out.push(t(n === 1 ? ' It hit a joint limit.' : ` ${word(n)} of them hit a joint limit.`));
  }
  return out;
}

function cloudRun(r: WorldRecord): Segment[] {
  const plan = r.plan;
  const removed = textFact(plan, 'removedBuckets');
  const objects = fact(plan, 'objectsRemoved');
  const bucketsRemoved = fact(plan, 'bucketsRemoved');
  if (removed !== undefined && objects !== undefined) {
    if (bucketsRemoved === undefined || bucketsRemoved === 1) {
      return [
        b('Run.'),
        t(" I run the agent's command on my copy… poof! "),
        c(removed),
        t(` and its ${formatCount(objects)} objects are gone, in the copy only.`),
      ];
    }
    return [
      b('Run.'),
      t(" I run the agent's command on my copy… poof! "),
      c(names(removed)),
      t(` and their ${formatCount(objects)} objects are gone, in the copy only.`),
    ];
  }
  const emptiedIn = textFact(plan, 'objectsDeletedIn');
  const objectsDeleted = fact(plan, 'objectsDeleted');
  if (removed === undefined && emptiedIn !== undefined && objectsDeleted !== undefined && objectsDeleted > 0) {
    return [
      b('Run.'),
      t(` I run the agent's command on my copy… poof! ${formatCount(objectsDeleted)} ${objectsDeleted === 1 ? 'object' : 'objects'} in `),
      c(names(emptiedIn)),
      t(' are gone, in the copy only.'),
    ];
  }
  const after = plan.copyAfter;
  const tagged = after.kind === 'cloud' ? after.buckets.filter((bk) => bk.tag !== undefined) : [];
  const first = tagged[0];
  if (first !== undefined && first.tag !== undefined) {
    return [
      b('Run.'),
      t(" I run the agent's command on my copy… poof! "),
      c(first.name),
      t(' now shows '),
      c(first.tag),
      t(', in the copy only.'),
    ];
  }
  if (removed === undefined && bucketsRemoved === 0) {
    return [b('Run.'), t(" I run the agent's command on my copy. Nothing in the copy was deleted.")];
  }
  return GENERIC_RUN;
}

// Step 3 (Judge)

function shellJudge(r: WorldRecord): Segment[] {
  const plan = r.plan;
  const rowsLost = fact(plan, 'rowsLost');
  const allowed = labelNumber(plan.checks[0]?.label);
  if (rowsLost === undefined || allowed === undefined) return genericJudge(r, plan);
  return [
    b('Judge.'),
    t(' Ward '),
    c(r.ward.id),
    t(` allows ${formatCount(allowed)} lost rows. My copy lost ${formatCount(rowsLost)}.`),
    ...extraRows(plan, 1),
    ...outsideTail(plan),
  ];
}

function handJudge(r: WorldRecord): Segment[] {
  const plan = r.plan;
  const total = fact(plan, 'total');
  const succeeded = fact(plan, 'succeeded');
  const needed = labelNumber(plan.checks[0]?.label);
  if (total === undefined || succeeded === undefined || needed === undefined) return genericJudge(r, plan);
  const out: Segment[] = [
    b('Judge.'),
    t(' Ward '),
    c(r.ward.id),
    t(` needs ${needed}% success. We got ${formatRate(succeeded, total)}.`),
  ];
  const force = fact(plan, 'maxForceN');
  const limit = labelNumber(plan.checks[1]?.label);
  if (force !== undefined) {
    out.push(t(` The strongest touch was ${formatForce(force)}`));
    out.push(t(limit !== undefined && plan.checks[1]?.ok === false ? `, over the ${limit} N limit.` : '.'));
  }
  const vase = fact(plan, 'vaseTouched');
  if (vase !== undefined) {
    out.push(t(vase === 0 ? ' The vase stayed untouched.' : ` The vase was touched in ${vase} of ${total} variants.`));
  }
  return [...out, ...extraRows(plan, 3), ...outsideTail(plan)];
}

function cloudJudge(r: WorldRecord): Segment[] {
  const plan = r.plan;
  const label = plan.checks[0]?.label;
  const prefix = 'never delete ';
  if (label === undefined || !label.startsWith(prefix)) return genericJudge(r, plan);
  return [
    b('Judge.'),
    t(' Ward '),
    c(r.ward.id),
    t(' says never delete '),
    c(label.slice(prefix.length)),
    t('.'),
    ...extraRows(plan, 1),
    ...outsideTail(plan),
  ];
}

// Step 4 (Verdict)

/** Said wherever the Cloud candle stays lit: the world has no real mode to go on to. */
const CLOUD_NO_REAL = ' Ghost Cloud has no real mode yet.';

function verdictStep(r: WorldRecord): Segment[] {
  const plan = r.plan;
  const finger = fingerprintSentence(plan);
  if (plan.verdict === 'pass') {
    return [b('Verdict.'), t(` I keep the candle lit: pass.${finger}${r.id === 'cloud' ? CLOUD_NO_REAL : ''}`)];
  }
  if (plan.verdict === 'warn') {
    const out: Segment[] = [b('Verdict.'), t(' The candle flickers: ask a human.')];
    if (plan.effectsOutside.length > 0) out.push(t(' The plan reaches for '), c(plan.effectsOutside.join(', ')), t('.'));
    out.push(t(finger));
    return out;
  }
  switch (r.id) {
    case 'shell':
      return [b('Verdict.'), t(` I blow the candle out: blocked.${finger}`)];
    case 'hand':
      return [b('Verdict.'), t(` I blow the candle out: blocked.${plan.p1.equal ? ' The real arm stays still.' : finger}`)];
    case 'cloud': {
      const removed = textFact(plan, 'removedBuckets');
      if (removed === undefined || !plan.p1.equal) return [b('Verdict.'), t(` I blow the candle out: blocked.${plan.p1.equal ? ' Reality is untouched.' : finger}`)];
      return [b('Verdict.'), t(' I blow the candle out: blocked. The real '), c(names(removed)), t(' is untouched.')];
    }
  }
}

// Step 5 (Fix and go)

function shellFix(r: WorldRecord): Segment[] {
  const plan = finalPlan(r);
  const rowsLost = fact(plan, 'rowsLost');
  if (rowsLost === undefined) return [b('Fix and go.'), t(' The agent tries a safer plan.')];
  const soft = plan.copyAfter.kind === 'shell' ? plan.copyAfter.tables.find((tb) => tb.state === 'soft') : undefined;
  const gone = fact(plan, 'entriesGone');
  const lead = soft !== undefined ? ` The agent backs up first and only marks ${soft.name} as deleted.` : ' The agent tries a safer plan.';
  const goneText = gone !== undefined && gone > 0 ? `, ${formatCount(gone)} entries gone` : '';
  return [b('Fix and go.'), t(`${lead} ${formatCount(rowsLost)} rows lost${goneText}${verdictTail(plan)}`)];
}

function handFix(r: WorldRecord): Segment[] {
  const plan = finalPlan(r);
  const total = fact(plan, 'total');
  const succeeded = fact(plan, 'succeeded');
  const out: Segment[] = [b('Fix and go.'), t(' New plan: '), c(plan.display), t('.')];
  if (total === undefined || succeeded === undefined) return out;
  const limit = labelNumber(plan.checks[1]?.label);
  const force = fact(plan, 'maxForceN');
  const forceOk = plan.checks[1]?.ok !== false;
  if (succeeded === total && limit !== undefined && forceOk) {
    out.push(t(` All ${total} ghosts succeed under ${limit} N${verdictTail(plan)}`));
  } else {
    const strongest = force !== undefined ? ` and the strongest touch is ${formatForce(force)}` : '';
    out.push(t(` ${formatRate(succeeded, total)} succeed${strongest}${verdictTail(plan)}`));
  }
  return out;
}

function cloudFix(r: WorldRecord): Segment[] {
  const plan = finalPlan(r);
  const removed = textFact(plan, 'removedBuckets');
  if (removed !== undefined && plan.verdict === 'pass' && plan.p1.equal) {
    return [
      b('Fix and go.'),
      t(' The agent meant the build cache. '),
      c(names(removed)),
      t(` is not protected, so the candle is lit.${CLOUD_NO_REAL}`),
    ];
  }
  return [b('Fix and go.'), t(` The agent tries another command${verdictTail(plan)}`)];
}

function fixStep(r: WorldRecord): Segment[] {
  switch (r.outcome) {
    case 'block-fixed':
      return r.id === 'shell' ? shellFix(r) : r.id === 'hand' ? handFix(r) : cloudFix(r);
    case 'block-open':
      return [b('Fix and go.'), t(' I have no fix for this plan, and I will not make one up. Edit the plan above and run again.')];
    case 'pass':
      return r.plan.p1.equal
        ? [
            b('Fix and go.'),
            t(
              r.id === 'cloud'
                ? ` Nothing needs fixing. The candle is lit.${CLOUD_NO_REAL}`
                : ' Nothing needs fixing. The candle is lit, so the real action may go ahead.',
            ),
          ]
        : [b('Fix and go.'), t(' The isolation check failed, so nothing goes ahead.')];
    case 'warn':
      return [b('Fix and go.'), t(' I fix nothing here. A human has to say yes before anything runs for real.')];
    case 'unsupported':
      return unsupportedNarration(r);
  }
}

// Unsupported input

/** Fixed lead of the explanation of input that the ghost does not know. */
const UNKNOWN_PLAN = " I don't know this plan, so I did not run it.";

/**
 * The ghost's explanation of unsupported input: that it does not know the plan, the engine's fixed reason, and
 * the list of what it knows. Holds no part of the input.
 */
function unsupportedNarration(r: WorldRecord): Segment[] {
  const out: Segment[] = [b('Hmm.'), t(UNKNOWN_PLAN)];
  const reason = r.unsupported?.reason;
  if (reason !== undefined && reason !== '') out.push(t(` ${reason}`));
  const known = r.unsupported?.known ?? [];
  if (known.length > 0) {
    out.push(t(r.id === 'hand' ? ' These are the ranges I know: ' : ' These are the commands I know: '));
    known.forEach((item, k) => {
      if (k > 0) out.push(t(', '));
      out.push(c(item));
    });
    out.push(t('.'));
  }
  return out;
}

// Tables

type Template = (r: WorldRecord) => Segment[];

const RUN: Record<WorldId, Template> = { shell: shellRun, hand: handRun, cloud: cloudRun };
const JUDGE: Record<WorldId, Template> = { shell: shellJudge, hand: handJudge, cloud: cloudJudge };

/** The five step templates of one world; the Outcome is read from the record inside each one. */
function stepTemplates(world: WorldId): readonly Template[] {
  return [copyStep, RUN[world], JUDGE[world], verdictStep, fixStep];
}

export const NARRATION: Record<WorldId, readonly Template[]> = {
  shell: stepTemplates('shell'),
  hand: stepTemplates('hand'),
  cloud: stepTemplates('cloud'),
};

/** The narration of step `step` (0 to 4) of one world, with its numbers taken from the record. */
export function narration(record: WorldRecord, step: number): Segment[] {
  const template = NARRATION[record.id][step];
  if (!template) throw new Error(`No narration for world ${record.id}, step ${step}`);
  if (record.outcome === 'unsupported') return unsupportedNarration(record);
  return template(record);
}

// Labels and loading lines

const STEP_NAMES = ['Copy · snapshot()', 'Run · step()', 'Judge · diff() and effectsOutside()', 'Verdict · render() and fingerprint()', 'Fix and go'];

/** The small label above the speech: "STEP 1 · Copy · snapshot()" (Requirement 4, criterion 3). */
export function stepLabel(step: number): string {
  const name = STEP_NAMES[step];
  if (name === undefined) throw new Error(`No label for step ${step}`);
  return `STEP ${step + 1} · ${name}`;
}

/** The fixed loading line of a world, shown while a run is pending. */
export function loadingLine(world: WorldId): Segment[] {
  switch (world) {
    case 'shell':
      return [t('Copying the project…')];
    case 'hand':
      return [t('Summoning eight ghost arms…')];
    case 'cloud':
      return [t('Copying the buckets…')];
  }
}
