// Task 8.3: the verification table of the wards design, run on synthetic GhostReport values
// with the default wards file (apps/ghost-shell/wards.yaml). No Docker. Violation counts are
// computed from the Changes of each fixture, never hard-coded, because the playground also
// emits folder-entry deletions. Only canary values and reserved domains are used.
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderMessage, WardEngine } from '@ghost-run/core';
import type {
  Change,
  EvaluateInputs,
  GhostReport,
  ObservedEvent,
  RenderContext,
  WardSet,
} from '@ghost-run/core';
import { loadWardsFile } from '../src/node.js';

const DEFAULT_FILE = fileURLToPath(new URL('../../apps/ghost-shell/wards.yaml', import.meta.url));
const CANARY = 'sk-CANARY-abc123';
const ENV_TEXT = `API_KEY=${CANARY}\n`;
const enc = new TextEncoder();

let wardSet: WardSet;

beforeAll(async () => {
  const r = await loadWardsFile(DEFAULT_FILE);
  if (!r.ok) throw new Error('default wards file did not load');
  wardSet = r.wardSet;
});

function report(
  changes: readonly Change[],
  observedEvents: readonly ObservedEvent[] = [],
): GhostReport<unknown> {
  return {
    snapshots: [],
    changes: [[...changes]],
    effectsOutside: [[]],
    observedEvents,
    variantResults: [],
  };
}

const del = (path: string): Change => ({ kind: 'file-deleted', path }) as Change;
const created = (path: string): Change => ({ kind: 'file-created', path }) as Change;
const overwritten = (path: string): Change => ({ kind: 'file-overwritten', path }) as Change;
const rows = (table: string, rowsBefore: number, rowsAfter: number, dropped?: boolean): Change =>
  ({
    kind: 'sql-row-count',
    table,
    rowsBefore,
    rowsAfter,
    ...(dropped === undefined ? {} : { dropped }),
  }) as Change;

const evaluate = (r: GhostReport<unknown>, inputs?: EvaluateInputs) =>
  WardEngine.evaluate(r, wardSet, inputs);

const CTX: RenderContext = {
  wardCount: 3,
  claims: { p5: true, p6: true },
  seance: { id: '42' },
};

/** Expected number of protect-data violations: distinct deleted paths under data/ (case-insensitive). */
function expectedDataDeletes(changes: readonly Change[]): number {
  const seen = new Set<string>();
  for (const c of changes) {
    const p = (c as { path?: unknown }).path;
    if (c.kind === 'file-deleted' && typeof p === 'string' && /^data(\/|$)/i.test(p)) {
      seen.add(p.toLowerCase());
    }
  }
  return seen.size;
}

const ROW2_FILES = [
  'data/.keep',
  'data/a.csv',
  'data/b.csv',
  'data/sub/c.json',
  'data/sub/d.json',
  'build/out.js',
];

describe('verification table scenarios', () => {
  it('row 1: DROP TABLE users blocks with the row count', () => {
    const v = evaluate(report([rows('users', 1206, 0, true)]));
    expect(v.verdict).toBe('block');
    expect(v.violations[0]).toMatchObject({
      wardId: 'no-data-loss',
      reason: 'would delete 1,206 rows from users',
    });
    expect(renderMessage(v, CTX)).toBe(
      'GHOST RUN BLOCKED by ward no-data-loss: would delete 1,206 rows from users. Try a soft delete or a migration with a backup. Seance: http://localhost:5317/seance/42',
    );
  });

  it('row 1b: backup copy plus soft delete passes', () => {
    const v = evaluate(
      report([created('app.db.bak'), overwritten('app.db'), rows('users', 1206, 1206)]),
    );
    expect(v.verdict).toBe('pass');
    expect(v.violations).toEqual([]);
  });

  it('row 2: rm -rf ./data ./build blocks, one violation per deleted path under data/', () => {
    const changes = ROW2_FILES.map(del);
    const v = evaluate(report(changes));
    expect(v.verdict).toBe('block');
    const n = expectedDataDeletes(changes);
    expect(n).toBeGreaterThan(0);
    expect(v.violations).toHaveLength(n);
    expect(v.violations.every((x) => x.wardId === 'protect-data')).toBe(true);
    expect(v.violations[0]?.reason).toBe('would delete protected path data/.keep');
    const more = n - 4; // the message lists four violations
    expect(renderMessage(v, CTX)).toBe(
      [
        'GHOST RUN BLOCKED by ward protect-data: would delete protected path data/.keep. Limit the command to paths the ward does not protect, or back up the protected paths first.',
        'Also violated ward protect-data: would delete protected path data/a.csv.',
        'Also violated ward protect-data: would delete protected path data/b.csv.',
        'Also violated ward protect-data: would delete protected path data/sub/c.json.',
        `+${more} more violations. See the seance page. Seance: http://localhost:5317/seance/42`,
      ].join('\n'),
    );
  });

  it('row 2 with folder-entry deletions: count follows the Changes of the fixture', () => {
    const changes = ['data', 'data/sub', ...ROW2_FILES, 'build'].map(del);
    const v = evaluate(report(changes));
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(expectedDataDeletes(changes));
    expect(v.violations.map((x) => x.reason)).toContain('would delete protected path data');
  });

  it('row 2b: rm -rf ./build passes', () => {
    const v = evaluate(report([del('build/out.js')]));
    expect(v.verdict).toBe('pass');
    expect(v.violations).toEqual([]);
  });

  it('row 2c: rm -rf ./DATA blocks (case spelling)', () => {
    const v = evaluate(report([del('DATA/a.csv')]));
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]).toMatchObject({
      wardId: 'protect-data',
      reason: 'would delete protected path DATA/a.csv',
    });
  });

  const readEnv: ObservedEvent = { kind: 'secret-read', path: '.env', stepIndex: 0 };
  const sendSetup: ObservedEvent = {
    kind: 'network-attempt',
    destination: 'setup-check.example:443',
    stepIndex: 0,
    eventId: 'evt-1',
  };
  const BEHAVIOR_REASON =
    'network attempt to setup-check.example:443 at step 0 after secret read at step 0; host not in allow_hosts';
  const CONTENT_REASON =
    'payload of event evt-1 contains a value from secret file .env (encoding: raw)';

  it('row 3: secret read and network attempt at the same step blocks', () => {
    const v = evaluate(report([], [readEnv, sendSetup]));
    expect(v.verdict).toBe('block');
    expect(v.violations[0]).toMatchObject({ wardId: 'no-secret-egress', reason: BEHAVIOR_REASON });
  });

  it('row 3b: adds the content violation with encoding raw', () => {
    const v = evaluate(report([], [readEnv, sendSetup]), {
      secretValues: new Map([['.env', enc.encode(ENV_TEXT)]]),
      payloads: new Map([['evt-1', enc.encode(`API_KEY=${CANARY}`)]]),
    });
    expect(v.verdict).toBe('block');
    expect(v.violations.map((x) => x.reason)).toEqual([BEHAVIOR_REASON, CONTENT_REASON]);
    expect(JSON.stringify(v)).not.toContain(CANARY);
  });

  const registry: ObservedEvent = {
    kind: 'network-attempt',
    destination: 'registry.npmjs.org:443',
    stepIndex: 1,
    eventId: 'evt-1',
  };

  it('row 3c: allowed host after the read is warn with two notices and no violation', () => {
    const v = evaluate(report([], [readEnv, registry]), {
      secretValues: new Map([['.env', enc.encode(ENV_TEXT)]]),
    });
    expect(v.verdict).toBe('warn');
    expect(v.violations).toEqual([]);
    expect(v.notices).toHaveLength(2);
  });

  it('row 3d: a Canary payload sent to an allowed host blocks', () => {
    const v = evaluate(report([], [readEnv, registry]), {
      secretValues: new Map([['.env', enc.encode(ENV_TEXT)]]),
      payloads: new Map([['evt-1', enc.encode(`API_KEY=${CANARY}`)]]),
    });
    expect(v.verdict).toBe('block');
    expect(v.violations[0]?.reason).toBe(CONTENT_REASON);
    expect(JSON.stringify(v)).not.toContain(CANARY);
  });

  it('row 4: npm test passes with no changes and no events', () => {
    const v = evaluate(report([]));
    expect(v.verdict).toBe('pass');
    expect(v.violations).toEqual([]);
    expect(v.notices).toEqual([]);
  });

  it('row 5: npm run clean blocks by protect-data from file-deleted Changes', () => {
    const changes = [del('data/a.csv'), del('data/b.csv')];
    const v = evaluate(report(changes));
    expect(v.verdict).toBe('block');
    expect(v.violations).toHaveLength(expectedDataDeletes(changes));
    expect(v.violations[0]).toMatchObject({
      wardId: 'protect-data',
      reason: 'would delete protected path data/a.csv',
    });
  });
});

describe('lowered claims', () => {
  it('static-analysis claims add the lowered-claim line to the row 1 message', () => {
    const v = evaluate(report([rows('users', 1206, 0, true)]));
    const lowered = renderMessage(v, {
      wardCount: 3,
      claims: { p5: false, p6: false, reason: 'static-analysis' },
      seance: { id: '42' },
    });
    const full = renderMessage(v, CTX);
    expect(lowered).not.toBe(full);
    expect(lowered).toContain(
      'P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).',
    );
    expect(full).not.toContain('NOT guaranteed');
  });
});
