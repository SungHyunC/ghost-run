import { describe, expect, it } from 'vitest';
import { MAX_PLAN_FILE_BYTES, parsePlanFile, printPlanFile } from '../../src/plan/plan-file.js';
import type { PlanFile } from '../../src/plan/plan-file.js';

const REACH = { type: 'reach', target: [0, 0.1, 0.2], speed: 0.3 };
const GRASP = { type: 'grasp', force: 10 };
const PULL = { type: 'pull', distance: 0.1, speed: 0.2 };
const RELEASE = { type: 'release' };

function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'ghost-hand-plan',
    version: 1,
    name: 'open the drawer',
    origin: 'scripted',
    actions: [REACH, GRASP, PULL, RELEASE],
    ...over,
  };
}

function parse(obj: unknown) {
  return parsePlanFile(JSON.stringify(obj));
}

function errorsOf(text: string): { code: string; field: string }[] {
  const r = parsePlanFile(text);
  if (r.ok) throw new Error('expected failure');
  return r.errors.map((e) => ({ code: e.code, field: e.field }));
}

function without(key: string): Record<string, unknown> {
  const o = base();
  delete o[key];
  return o;
}

const ZWSP = String.fromCodePoint(0x200b);

describe('parsePlanFile: success', () => {
  it('accepts a minimal plan and all optional fields', () => {
    expect(parse(base()).ok).toBe(true);
    const r = parse(base({ note: 'n', recordedWith: 'kiro', revisionOf: 'prev', taskText: 't' }));
    expect(r.ok && r.plan.revisionOf).toBe('prev');
  });

  it('accepts hidden code points in taskText written as \\u escapes in the file text', () => {
    const text = `{"format":"ghost-hand-plan","version":1,"name":"p","origin":"recorded","actions":[{"type":"release"}],"taskText":"a\\u200Bb\\ud83d\\udc7b\\u202e"}`;
    const r = parsePlanFile(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.taskText).toBe(`a${ZWSP}b${String.fromCodePoint(0x1f47b)}${String.fromCodePoint(0x202e)}`);
  });

  it('round-trips through the printer', () => {
    const r = parse(base({ note: 'caf\u00e9', taskText: `x${ZWSP}y` }));
    if (!r.ok) throw new Error('parse');
    const text = printPlanFile(r.plan);
    const again = parsePlanFile(text);
    expect(again).toEqual(r);
    expect(printPlanFile((again as { plan: PlanFile }).plan)).toBe(text);
  });
});

describe('parsePlanFile: error codes and fields', () => {
  it('input-too-large above 1 MiB, accepted check by bytes not characters', () => {
    expect(errorsOf('x'.repeat(MAX_PLAN_FILE_BYTES + 1))).toEqual([{ code: 'input-too-large', field: '' }]);
    // 349526 three-byte characters = 1048578 bytes, but only 349526 code units
    expect(errorsOf('\u20ac'.repeat(349526))[0]?.code).toBe('input-too-large');
    expect(errorsOf('{ not json')[0]?.code).toBe('invalid-json');
  });

  it('invalid-json', () => {
    expect(errorsOf('{ nope')).toEqual([{ code: 'invalid-json', field: '' }]);
    expect(errorsOf('')).toEqual([{ code: 'invalid-json', field: '' }]);
  });

  it('wrong-type for root, fields, and actions', () => {
    expect(errorsOf('[]')).toEqual([{ code: 'wrong-type', field: '' }]);
    expect(errorsOf('null')).toEqual([{ code: 'wrong-type', field: '' }]);
    expect(errorsOf(JSON.stringify(base({ name: 5 })))).toEqual([{ code: 'wrong-type', field: 'name' }]);
    expect(errorsOf(JSON.stringify(base({ version: '1' })))).toEqual([{ code: 'wrong-type', field: 'version' }]);
    expect(errorsOf(JSON.stringify(base({ origin: 'other' })))).toEqual([{ code: 'wrong-type', field: 'origin' }]);
    expect(errorsOf(JSON.stringify(base({ actions: {} })))).toEqual([{ code: 'wrong-type', field: 'actions' }]);
    expect(errorsOf(JSON.stringify(base({ actions: [5] })))).toEqual([{ code: 'wrong-type', field: 'actions[0]' }]);
    expect(errorsOf(JSON.stringify(base({ actions: [{ type: 'grasp', force: '5' }] })))).toEqual([
      { code: 'wrong-type', field: 'actions[0].force' },
    ]);
    expect(errorsOf(JSON.stringify(base({ actions: [{ type: 'reach', target: [1, 2], speed: 0.1 }] })))).toEqual([
      { code: 'wrong-type', field: 'actions[0].target' },
    ]);
  });

  it('missing-field for each required key and action key', () => {
    for (const k of ['format', 'version', 'name', 'origin', 'actions']) {
      expect(errorsOf(JSON.stringify(without(k)))).toContainEqual({ code: 'missing-field', field: k });
    }
    expect(errorsOf(JSON.stringify(base({ actions: [{ type: 'pull', distance: 0.1 }] })))).toEqual([
      { code: 'missing-field', field: 'actions[0].speed' },
    ]);
    expect(errorsOf(JSON.stringify(base({ actions: [{}] })))).toEqual([
      { code: 'missing-field', field: 'actions[0].type' },
    ]);
  });

  it('unknown-field at the root is rejected with its path', () => {
    expect(errorsOf(JSON.stringify(base({ extra: 1 })))).toEqual([{ code: 'unknown-field', field: 'extra' }]);
  });

  it('unknown-field inside an action is rejected with its path', () => {
    expect(errorsOf(JSON.stringify(base({ actions: [RELEASE, { type: 'grasp', force: 5, bogus: 1 }] })))).toEqual([
      { code: 'unknown-field', field: 'actions[1].bogus' },
    ]);
  });

  it('unsupported-version for version and format', () => {
    expect(errorsOf(JSON.stringify(base({ version: 2 })))).toEqual([{ code: 'unsupported-version', field: 'version' }]);
    expect(errorsOf(JSON.stringify(base({ format: 'other' })))).toEqual([
      { code: 'unsupported-version', field: 'format' },
    ]);
  });

  it('unknown-action', () => {
    expect(errorsOf(JSON.stringify(base({ actions: [{ type: 'jump' }] })))).toEqual([
      { code: 'unknown-action', field: 'actions[0].type' },
    ]);
  });
});

describe('parsePlanFile: out-of-range', () => {
  it('action count 0 and 51', () => {
    expect(errorsOf(JSON.stringify(base({ actions: [] })))).toEqual([{ code: 'out-of-range', field: 'actions' }]);
    expect(errorsOf(JSON.stringify(base({ actions: Array.from({ length: 51 }, () => RELEASE) })))).toEqual([
      { code: 'out-of-range', field: 'actions' },
    ]);
    expect(parse(base({ actions: Array.from({ length: 50 }, () => RELEASE) })).ok).toBe(true);
  });

  it('action values outside the world ranges', () => {
    const bad: unknown[] = [
      { type: 'grasp', force: 41 },
      { type: 'grasp', force: 1 },
      { type: 'pull', distance: 0.3, speed: 0.2 },
      { type: 'pull', distance: 0.1, speed: 0.7 },
      { type: 'reach', target: [0.31, 0, 0.2], speed: 0.2 },
      { type: 'reach', target: [0, 0, 0.01], speed: 0.2 },
    ];
    for (const a of bad) {
      expect(errorsOf(JSON.stringify(base({ actions: [RELEASE, a] })))).toEqual([
        { code: 'out-of-range', field: 'actions[1]' },
      ]);
    }
  });

  it('name length 0, 1, 80, 81 code points', () => {
    expect(errorsOf(JSON.stringify(base({ name: '' })))).toEqual([{ code: 'out-of-range', field: 'name' }]);
    expect(errorsOf(JSON.stringify(base({ name: 'a'.repeat(81) })))).toEqual([{ code: 'out-of-range', field: 'name' }]);
    expect(parse(base({ name: 'a' })).ok).toBe(true);
    expect(parse(base({ name: 'a'.repeat(80) })).ok).toBe(true);
    // 80 astral code points are 160 code units but within the limit
    expect(parse(base({ name: String.fromCodePoint(0x1f47b).repeat(80) })).ok).toBe(true);
  });

  it('note, recordedWith, revisionOf, taskText limits', () => {
    const limits: [string, number][] = [
      ['note', 500],
      ['recordedWith', 120],
      ['revisionOf', 80],
      ['taskText', 4096],
    ];
    for (const [k, max] of limits) {
      expect(parse(base({ [k]: 'a'.repeat(max) })).ok).toBe(true);
      expect(errorsOf(JSON.stringify(base({ [k]: 'a'.repeat(max + 1) })))).toEqual([
        { code: 'out-of-range', field: k },
      ]);
    }
  });
});

describe('parsePlanFile: invalid-character', () => {
  it('rejects control and hidden characters in name', () => {
    for (const cp of [0x00, 0x0a, 0x1f, 0x7f, 0x9f, 0x200b, 0x202e, 0xfeff, 0xe0041]) {
      expect(errorsOf(JSON.stringify(base({ name: `a${String.fromCodePoint(cp)}b` })))).toEqual([
        { code: 'invalid-character', field: 'name' },
      ]);
    }
  });

  it('rejects them in note, recordedWith, and revisionOf too', () => {
    for (const k of ['note', 'recordedWith', 'revisionOf']) {
      expect(errorsOf(JSON.stringify(base({ [k]: `a${ZWSP}` })))).toEqual([{ code: 'invalid-character', field: k }]);
    }
  });

  it('does not reject them in taskText', () => {
    const r = parse(base({ taskText: `a${ZWSP}\n\u0001${String.fromCodePoint(0xe0041)}` }));
    expect(r.ok).toBe(true);
  });
});

describe('printPlanFile', () => {
  it('prints only ASCII at or below 0x7E, with a trailing newline', () => {
    const r = parse(
      base({
        name: 'caf\u00e9 \u4f60\u597d',
        note: String.fromCodePoint(0x1f47b),
        taskText: `${ZWSP}\u007f\uffff${String.fromCodePoint(0xe0041)}`,
      }),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const text = printPlanFile(r.plan);
    for (let i = 0; i < text.length; i += 1) expect(text.charCodeAt(i)).toBeLessThanOrEqual(0x7e);
    expect(text.endsWith('}\n')).toBe(true);
    const back = parsePlanFile(text);
    expect(back).toEqual(r);
  });

  it('uses a fixed key order and omits absent optional fields', () => {
    const r = parse({ ...base(), taskText: 't', note: 'n' });
    if (!r.ok) throw new Error('parse');
    expect(Object.keys(JSON.parse(printPlanFile(r.plan)) as object)).toEqual([
      'format',
      'version',
      'name',
      'origin',
      'actions',
      'note',
      'taskText',
    ]);
  });
});
