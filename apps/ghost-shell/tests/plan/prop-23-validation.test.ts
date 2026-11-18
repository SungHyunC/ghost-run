import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { NUM_RUNS, PBT_TIMEOUT } from '../pbt-config';
import { parsePlanFile } from '../../src/plan/plan-file';
import { validateCommand } from '../../src/plan/validate-command';

type Json = Record<string, unknown>;
interface Mutation {
  readonly doc: Json;
  readonly code: string;
  readonly field: string;
}

const word = fc.stringMatching(/^[a-z]{1,10}$/);
const actionArb = fc.record({ command: word }, { requiredKeys: ['command'] }).chain((a) =>
  fc.option(word, { nil: undefined }).map((cwd) => (cwd === undefined ? a : { ...a, cwd })),
);

const validArb: fc.Arbitrary<Json> = fc
  .record({
    name: word,
    origin: fc.constantFrom('recorded', 'scripted'),
    actions: fc.array(actionArb, { minLength: 1, maxLength: 5 }),
    note: fc.option(word, { nil: undefined }),
  })
  .map(({ name, origin, actions, note }) => ({
    format: 'ghost-run-plan',
    version: 1,
    name,
    origin,
    actions,
    ...(note === undefined ? {} : { note }),
  }));

// Control and hidden code points, written as escapes.
const BAD_CHARS = ['\u0000', '\u0001', '\u001f', '\u007f', '\u0085', '\u009f', '\u200B', '\u202E', '\u2066', '\u{E0041}'];
const badChar = fc.constantFrom(...BAD_CHARS);

type Kind =
  | 'unknown-root'
  | 'unknown-action'
  | 'wrong-type'
  | 'missing'
  | 'version'
  | 'range'
  | 'conflict'
  | 'bad-char';

const mutationArb: fc.Arbitrary<Mutation> = fc
  .tuple(
    validArb,
    fc.constantFrom<Kind>('unknown-root', 'unknown-action', 'wrong-type', 'missing', 'version', 'range', 'conflict', 'bad-char'),
    fc.nat(),
    badChar,
    fc.integer({ min: 2, max: 1000 }),
  )
  .chain(([doc, kind, pick, bad, big]): fc.Arbitrary<Mutation> => {
    const actions = doc['actions'] as Json[];
    const idx = pick % actions.length;
    switch (kind) {
      case 'unknown-root':
        return word.map((w) => ({ doc: { ...doc, [`x${w}`]: 1 }, code: 'unknown-field', field: `x${w}` }));
      case 'unknown-action':
        return word.map((w) => ({
          doc: { ...doc, actions: actions.map((a, i) => (i === idx ? { ...a, [`x${w}`]: 1 } : a)) },
          code: 'unknown-field',
          field: `actions[${idx}].x${w}`,
        }));
      case 'wrong-type': {
        const targets = ['name', 'origin', 'version', 'actions', `actions[${idx}].command`, 'format'];
        const t = targets[pick % targets.length] as string;
        if (t.startsWith('actions[')) {
          return fc.constant({
            doc: { ...doc, actions: actions.map((a, i) => (i === idx ? { ...a, command: 5 } : a)) },
            code: 'wrong-type',
            field: t,
          });
        }
        // A number is a valid type for `version` (it would be `unsupported-version`), so use a string there.
        const wrong = t === 'actions' || t === 'version' ? 'x' : 5;
        return fc.constant({ doc: { ...doc, [t]: wrong }, code: 'wrong-type', field: t });
      }
      case 'missing': {
        const t = ['format', 'version', 'name', 'origin', 'actions'][pick % 5] as string;
        const { [t]: _removed, ...rest } = doc;
        return fc.constant({ doc: rest, code: 'missing-field', field: t });
      }
      case 'version':
        return fc.constant({ doc: { ...doc, version: big }, code: 'unsupported-version', field: 'version' });
      case 'range': {
        const opts: Mutation[] = [
          { doc: { ...doc, name: '' }, code: 'out-of-range', field: 'name' },
          { doc: { ...doc, name: 'n'.repeat(81) }, code: 'out-of-range', field: 'name' },
          { doc: { ...doc, note: 'n'.repeat(501) }, code: 'out-of-range', field: 'note' },
          { doc: { ...doc, actions: [] }, code: 'out-of-range', field: 'actions' },
          {
            doc: { ...doc, actions: Array.from({ length: 51 }, () => ({ command: 'ls' })) },
            code: 'out-of-range',
            field: 'actions',
          },
          {
            doc: { ...doc, actions: [{ command: '' }] },
            code: 'out-of-range',
            field: 'actions[0].command',
          },
          {
            doc: { ...doc, actions: [{ command: 'c'.repeat(4097) }] },
            code: 'out-of-range',
            field: 'actions[0].command',
          },
          {
            doc: { ...doc, readings: Array.from({ length: 17 }, (_, i) => `f${i}.txt`) },
            code: 'out-of-range',
            field: 'readings',
          },
        ];
        return fc.constant(opts[pick % opts.length] as Mutation);
      }
      case 'conflict':
        return fc.constant({
          doc: { ...doc, provenance: [{ source: 'a.txt', kind: 'file', content: 'x' }], readings: ['a.txt'] },
          code: 'conflicting-fields',
          field: 'readings',
        });
      case 'bad-char': {
        const t = ['command', 'cwd', 'name', 'note'][pick % 4] as string;
        if (t === 'command' || t === 'cwd') {
          return fc.constant({
            doc: { ...doc, actions: actions.map((a, i) => (i === idx ? { ...a, [t]: `a${bad}b` } : a)) },
            code: 'invalid-character',
            field: `actions[${idx}].${t}`,
          });
        }
        return fc.constant({ doc: { ...doc, [t]: `a${bad}b` }, code: 'invalid-character', field: t });
      }
    }
  });

describe('Property 23: Plan_File and manual-command validation', () => {
  it(
    'a valid plan mutated in one place is rejected with the code and field of that place',
    () => {
      // **Validates: Requirements 13.3, 13.4, 13.5, 13.6**
      fc.assert(
        fc.property(mutationArb, (m) => {
          const r = parsePlanFile(JSON.stringify(m.doc));
          expect(r.ok).toBe(false);
          if (!r.ok) {
            expect(r.errors.some((e) => e.code === m.code && e.field === m.field)).toBe(true);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('regression: a numeric version other than 1 is unsupported-version, a string version is wrong-type', () => {
    const doc = { format: 'ghost-run-plan', name: 'a', origin: 'recorded', actions: [{ command: 'a' }] };
    const codeOf = (version: unknown): string[] => {
      const r = parsePlanFile(JSON.stringify({ ...doc, version }));
      return r.ok ? [] : r.errors.map((e) => `${e.code}@${e.field}`);
    };
    expect(codeOf(5)).toEqual(['unsupported-version@version']);
    expect(codeOf('x')).toEqual(['wrong-type@version']);
  });

  it('the unmutated plan is accepted', () => {
    fc.assert(
      fc.property(validArb, (doc) => {
        expect(parsePlanFile(JSON.stringify(doc)).ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('a text above 1 MiB yields input-too-large', () => {
    // **Validates: Requirements 13.4**
    fc.assert(
      fc.property(fc.constantFrom('a', '\u00e9', '\u20ac', '\u{1F47B}'), fc.integer({ min: 0, max: 50 }), (ch, extra) => {
        const bytes = new TextEncoder().encode(ch).length;
        const count = Math.ceil((1024 * 1024 + 1) / bytes) + extra;
        const r = parsePlanFile(ch.repeat(count));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors).toEqual([expect.objectContaining({ code: 'input-too-large' })]);
      }),
      { numRuns: Math.min(NUM_RUNS, 40) },
    );
  }, PBT_TIMEOUT);

  it('never throws for any string', () => {
    // **Validates: Requirements 13.3**
    fc.assert(
      fc.property(fc.oneof(fc.string({ unit: 'binary' }), fc.json(), fc.json().map((j) => `{"actions":${j}}`)), (s) => {
        const r = parsePlanFile(s);
        expect(typeof r.ok).toBe('boolean');
      }),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);

  it('validateCommand rejects empty, over-long, control, hidden commands and a full plan', () => {
    // **Validates: Requirements 14.3**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 49 }),
        badChar,
        word,
        (len, bad, w) => {
          expect(validateCommand('', len)).toBeDefined();
          expect(validateCommand('c'.repeat(4097), len)).toBeDefined();
          expect(validateCommand('\u{1F47B}'.repeat(4097), len)).toBeDefined();
          expect(validateCommand(`${w}${bad}${w}`, len)).toBeDefined();
          expect(validateCommand(w, 50)).toBeDefined();
          expect(validateCommand(w, len)).toBeUndefined();
          expect(validateCommand('\u{1F47B}'.repeat(4096), len)).toBeUndefined();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, PBT_TIMEOUT);
});
