import { renderMessage } from '@ghost-run/core';
import { describe, expect, it } from 'vitest';
import {
  askJson,
  BAD_RESULT_LINE,
  decisionFromRunResult,
  diffSummary,
  FLOOR_TEXT,
  PLAN_B_LINE,
  RUNNER_FAILED_LINE,
} from '../lib/gate/output.mjs';

const PASS_V = { verdict: 'pass', violations: [], notices: [] };
const BLOCK_V = {
  verdict: 'block',
  violations: [{ wardId: 'no-delete-src', wardKind: 'path', reason: 'would delete src/app.ts' }],
  notices: [],
};
const WARN_V = {
  verdict: 'warn',
  violations: [],
  notices: [{ kind: 'effect-outside', reason: 'network call to api.example', stepIndex: 0 }],
};
const DOCKER = { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] };
const PLAN_B = { mode: 'static-analysis', p1Claimed: false, p5Claimed: false, p6Claimed: false, readOnlyMounts: [] };

/** @param {Record<string, unknown>} over */
function makeResult(over = {}) {
  return /** @type {any} */ ({
    schemaVersion: 1,
    runId: 'run-1',
    status: 'ok',
    verdict: 'pass',
    wardVerdict: PASS_V,
    report: { snapshots: [], changes: [[{ kind: 'file-deleted', path: 'src/app.ts' }]], effectsOutside: [], observedEvents: [], variantResults: [] },
    isolation: DOCKER,
    diagnostics: [],
    ...over,
  });
}
const CTX = { wardCount: 3, graveId: 'grave-1', seanceBase: 'http://localhost:5317', warnMode: /** @type {const} */ ('exit2') };

describe('decisionFromRunResult: one example per row of the mapping table', () => {
  it('pass: allow, exit 0, pinned pass line on STDOUT, no permission field', () => {
    const d = decisionFromRunResult(makeResult(), CTX);
    expect(d).toMatchObject({ kind: 'allow', exit: 0, stderr: '' });
    expect(d.stdout).toBe('GHOST RUN PASSED: all 3 wards cleared.');
    expect(d.stdout).not.toContain('permissionDecision');
  });

  it('pass with a lowered claim adds the claim line', () => {
    const d = decisionFromRunResult(makeResult({ isolation: { ...DOCKER, p6Claimed: false } }), CTX);
    expect(d.exit).toBe(0);
    expect(d.stdout).toBe(
      'GHOST RUN PASSED: all 3 wards cleared.\nP5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).',
    );
  });

  it('warn in exit2 mode: deny, exit 2, message + diff summary + link on STDERR', () => {
    const d = decisionFromRunResult(makeResult({ verdict: 'warn', wardVerdict: WARN_V }), CTX);
    expect(d).toMatchObject({ kind: 'deny', exit: 2, stdout: '' });
    expect(d.stderr).toBe(
      [
        'GHOST RUN NEEDS HUMAN APPROVAL: 1 notice(s) outside the copy or needing review. First: network call to api.example. Seance: http://localhost:5317/seance/grave-1',
        'Diff summary: 1 deleted, 0 overwritten, 0 created, 0 symlinks changed, 0 rows lost.',
        '  file-deleted src/app.ts',
      ].join('\n'),
    );
  });

  it('warn in ask mode: exit 0, only the ask JSON on STDOUT, never allow, never empty', () => {
    const d = decisionFromRunResult(makeResult({ verdict: 'warn', wardVerdict: WARN_V }), { ...CTX, warnMode: 'ask' });
    expect(d).toMatchObject({ kind: 'ask', exit: 0, stderr: '' });
    const j = JSON.parse(d.stdout);
    expect(Object.keys(j)).toEqual(['hookSpecificOutput']);
    expect(Object.keys(j.hookSpecificOutput).sort()).toEqual(['permissionDecision', 'permissionDecisionReason']);
    expect(j.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(j.hookSpecificOutput.permissionDecisionReason).toContain('GHOST RUN NEEDS HUMAN APPROVAL');
  });

  it('block: deny, exit 2 in both modes, block message + diff summary + link', () => {
    for (const warnMode of /** @type {const} */ (['exit2', 'ask'])) {
      const d = decisionFromRunResult(makeResult({ verdict: 'block', wardVerdict: BLOCK_V }), { ...CTX, warnMode });
      expect(d).toMatchObject({ kind: 'deny', exit: 2, stdout: '' });
      expect(d.stderr).toContain('GHOST RUN BLOCKED by ward no-delete-src: would delete src/app.ts.');
      expect(d.stderr).toContain('Seance: http://localhost:5317/seance/grave-1');
      expect(d.stderr).toContain('Diff summary: 1 deleted');
    }
  });

  it('internal failure, bad input: deny, exit 2, one fixed line', () => {
    expect(decisionFromRunResult(makeResult({ status: 'internal-error' }), CTX)).toEqual({
      kind: 'deny', exit: 2, stdout: '', stderr: RUNNER_FAILED_LINE, stats: [],
    });
    expect(RUNNER_FAILED_LINE).toBe('GHOST RUN GATE ERROR: runner-failed; the tool call was not allowed.');
    for (const bad of [null, undefined, {}, { verdict: 'allow' }, makeResult({ isolation: undefined })]) {
      const d = decisionFromRunResult(/** @type {any} */ (bad), CTX);
      expect(d).toMatchObject({ kind: 'deny', exit: 2, stdout: '', stderr: BAD_RESULT_LINE });
    }
  });

  it('timeout: deny, exit 2 with the fixed floor line', () => {
    const d = decisionFromRunResult(makeResult({ status: 'timeout', verdict: 'warn' }), CTX);
    expect(d.exit).toBe(2);
    expect(d.stderr).toContain(FLOOR_TEXT.timeout);
  });

  it('an unknown warn mode is treated as exit2', () => {
    const d = decisionFromRunResult(makeResult({ verdict: 'warn', wardVerdict: WARN_V }), { ...CTX, warnMode: /** @type {any} */ ('x') });
    expect(d.exit).toBe(2);
  });

  it('a non-ok status never passes even when the verdict says pass', () => {
    const d = decisionFromRunResult(makeResult({ status: 'pipeline-deadline' }), CTX);
    expect(d.exit).toBe(2);
    expect(d.stderr).toContain(FLOOR_TEXT['pipeline-deadline']);
  });
});

describe('Plan B', () => {
  it('pins the claim lines, never exits 0, and returns at least warn', () => {
    expect(PLAN_B_LINE).toBe('P1 isolation is NOT guaranteed: Docker box unavailable, static analysis only.');
    const r = makeResult({ isolation: PLAN_B, wardVerdict: undefined, verdict: 'pass' });
    for (const warnMode of /** @type {const} */ (['exit2'])) {
      const d = decisionFromRunResult(r, { ...CTX, warnMode });
      expect(d.exit).toBe(2);
      expect(d.stderr).toContain(
        'P5 and P6 protections are NOT guaranteed for this run: no ghost rehearsal took place (static analysis only).',
      );
      expect(d.stderr).toContain(PLAN_B_LINE);
    }
  });

  it('raises no claim above the isolation flags', () => {
    const d = decisionFromRunResult(makeResult({ isolation: { ...PLAN_B, p5Claimed: true, p6Claimed: true }, verdict: 'block', wardVerdict: BLOCK_V }), CTX);
    expect(d.exit).toBe(2);
    expect(d.stderr).toContain('P5 and P6 protections are NOT guaranteed');
  });
});

describe('warn without notices', () => {
  const EMPTY = { verdict: 'warn', violations: [], notices: [] };

  it('Plan B reads as a natural sentence without the notice count or "First:"', () => {
    const r = makeResult({ isolation: PLAN_B, wardVerdict: EMPTY, verdict: 'warn' });
    const d = decisionFromRunResult(r, CTX);
    expect(d.exit).toBe(2);
    expect(d.stderr.split('\n')[0]).toBe(
      'GHOST RUN NEEDS HUMAN APPROVAL: Docker is unavailable, so this command was not rehearsed in a sealed copy.',
    );
    expect(d.stderr).not.toMatch(/notice\(s\)|First:|\(none\)/);
    expect(d.stderr).toContain(PLAN_B_LINE);
  });

  it('keeps the Seance link on the claim line and uses the non-Docker sentence when not Plan B', () => {
    const r = makeResult({ status: 'timeout', wardVerdict: EMPTY, verdict: 'warn' });
    const d = decisionFromRunResult(r, CTX);
    expect(d.stderr).toContain('GHOST RUN NEEDS HUMAN APPROVAL: the rehearsal did not finish cleanly');
    expect(d.stderr).toContain('Seance: http://localhost:5317/seance/grave-1');
    expect(d.stderr).not.toMatch(/notice\(s\)|First:|\(none\)/);
  });

  it('a warn with notices keeps the count and the first notice', () => {
    const d = decisionFromRunResult(makeResult({ verdict: 'warn', wardVerdict: WARN_V }), CTX);
    expect(d.stderr).toContain('1 notice(s)');
    expect(d.stderr).toContain('First: network call to api.example');
  });

  it('noClaims leaves out the claim line for pass, warn, and block', () => {
    const lowered = { ...DOCKER, p5Claimed: false, p6Claimed: false };
    for (const [verdict, ward] of /** @type {const} */ ([['pass', PASS_V], ['warn', WARN_V], ['block', BLOCK_V]])) {
      const d = decisionFromRunResult(makeResult({ isolation: lowered, verdict, wardVerdict: ward }), { ...CTX, noClaims: true });
      expect(d.stdout + d.stderr).not.toContain('NOT guaranteed');
      const withClaims = decisionFromRunResult(makeResult({ isolation: lowered, verdict, wardVerdict: ward }), CTX);
      expect(withClaims.stdout + withClaims.stderr).toContain('NOT guaranteed');
    }
  });
});

describe('floor lines', () => {
  it('pins every fixed string', () => {
    expect(FLOOR_TEXT).toEqual({
      'recorder-failure': 'The event recorder failed; network and secret-read checks may be incomplete.',
      'sqlite-unreadable': 'A SQLite file could not be read; row-loss checks may be incomplete.',
      'secret-values-unreadable': 'A secret file could not be read; content checks may be incomplete.',
      'protected-path-excluded': 'A protected path was left out of the copy; changes there were not rehearsed.',
      'external-change': 'The original files changed during the run; the result may not match reality.',
      'isolation-violation': 'The run reached files outside the copy; the result is not trusted.',
      'copy-timeout': 'Copying the workspace took too long; the rehearsal did not finish.',
      'pipeline-deadline': 'The rehearsal ran out of time; the result is incomplete.',
      timeout: 'The command timed out during the rehearsal; the result is incomplete.',
    });
  });

  it('adds one line per diagnostic when the runner raised the verdict, none for unknown names', () => {
    const d = decisionFromRunResult(
      makeResult({
        verdict: 'warn',
        diagnostics: [{ name: 'recorder-failure' }, { name: 'sqlite-unreadable' }, { name: 'free text <x>' }],
      }),
      CTX,
    );
    expect(d.stderr).toContain(FLOOR_TEXT['recorder-failure']);
    expect(d.stderr).toContain(FLOOR_TEXT['sqlite-unreadable']);
    expect(d.stderr).not.toContain('free text');
  });

  it('adds no floor line when the ward verdict already equals the verdict', () => {
    const d = decisionFromRunResult(
      makeResult({ verdict: 'warn', wardVerdict: WARN_V, diagnostics: [{ name: 'recorder-failure' }] }),
      CTX,
    );
    expect(d.stderr).not.toContain(FLOOR_TEXT['recorder-failure']);
  });
});

describe('fixed gate strings avoid the words sealed and isolated', () => {
  it('holds for every constant', () => {
    const all = [PLAN_B_LINE, RUNNER_FAILED_LINE, BAD_RESULT_LINE, ...Object.values(FLOOR_TEXT)];
    for (const s of all) expect(s).not.toMatch(/sealed|isolated/i);
  });
});

describe('O10: a warn verdict with no violations renders a warn template', () => {
  it('renderMessage prints the warn template', () => {
    const text = renderMessage({ verdict: 'warn', violations: [], notices: [] }, { wardCount: 2 });
    expect(text).toMatch(/^GHOST RUN NEEDS HUMAN APPROVAL:/);
  });
});

describe('askJson', () => {
  it('sanitizes hidden code points and cuts to 1,200 code points', () => {
    const j = JSON.parse(askJson('a\u200Bb' + 'x'.repeat(3000)));
    const reason = j.hookSpecificOutput.permissionDecisionReason;
    expect(reason).toContain('\\u{200B}');
    expect([...reason].length).toBeLessThanOrEqual(1200);
    expect(reason).toMatch(/\.\.\.$/);
  });
});

describe('diffSummary', () => {
  it('counts per kind and rows lost with the dropped rule', () => {
    const s = diffSummary([
      [
        { kind: 'file-deleted', path: 'b' },
        { kind: 'file-overwritten', path: 'a' },
        { kind: 'file-created', path: 'c' },
        { kind: 'symlink-changed', path: 'd' },
        { kind: 'sql-row-count', table: 't', rowsBefore: 10, rowsAfter: 4 },
      ],
      [{ kind: 'sql-row-count', table: 'u', rowsBefore: 7, rowsAfter: 0, dropped: true }],
    ]);
    expect(s.split('\n')).toEqual([
      'Diff summary: 1 deleted, 1 overwritten, 1 created, 1 symlinks changed, 13 rows lost.',
      '  file-overwritten a',
      '  file-deleted b',
      '  file-created c',
      '  symlink-changed d',
    ]);
  });

  it('lists at most 10 paths, then the more line', () => {
    const changes = Array.from({ length: 14 }, (_, i) => ({ kind: 'file-deleted', path: `f${String(i).padStart(2, '0')}` }));
    const lines = diffSummary([changes]).split('\n');
    expect(lines).toHaveLength(12);
    expect(lines.at(-1)).toBe('+4 more changes.');
  });

  it('escapes hidden code points in paths and stays within 1,200 code points', () => {
    const changes = Array.from({ length: 10 }, (_, i) => ({ kind: 'file-deleted', path: `${'p'.repeat(200)}\u202E${i}` }));
    const s = diffSummary([changes]);
    expect(s).not.toContain('\u202E');
    expect([...s].length).toBeLessThanOrEqual(1200);
    expect(s).toMatch(/\+\d+ more changes\.$/);
  });

  it('is deterministic and handles empty input', () => {
    expect(diffSummary([])).toBe('Diff summary: 0 deleted, 0 overwritten, 0 created, 0 symlinks changed, 0 rows lost.');
  });
});
