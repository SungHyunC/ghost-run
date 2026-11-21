// Pins the committed warn mode (task 17.3, decided by the human on 2026-11-21) [no-docker].
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { WARN_MODE } from '../gate-config.mjs';
import { decisionFromRunResult } from '../lib/gate/output.mjs';

const warnResult = {
  schemaVersion: 1,
  runId: 'run-1',
  status: 'ok',
  verdict: 'warn',
  wardVerdict: { verdict: 'warn', violations: [], notices: [{ kind: 'effect-outside', reason: 'url to example.test', stepIndex: 0 }] },
  report: { snapshots: [], changes: [[]], effectsOutside: [], observedEvents: [], variantResults: [] },
  isolation: { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true, readOnlyMounts: [] },
  diagnostics: [],
};

describe('warn mode', () => {
  it("the committed WARN_MODE is 'ask'", () => {
    expect(WARN_MODE).toBe('ask');
  });

  it('gate-config.mjs names the measurements entry and the date of the decision', async () => {
    const text = await readFile(new URL('../gate-config.mjs', import.meta.url), 'utf8');
    expect(text).toContain('docs/measurements.md');
    expect(text).toContain('Host checks before enabling the gate');
    expect(text).toContain('2026-11-21');
  });

  it('with the committed mode a warn is the ask JSON with exit 0, and a block stays exit 2', () => {
    const warn = decisionFromRunResult(/** @type {any} */ (warnResult), { wardCount: 1 });
    expect(warn.kind).toBe('ask');
    expect(warn.exit).toBe(0);
    const j = JSON.parse(warn.stdout);
    expect(j.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(j.hookSpecificOutput.permissionDecisionReason).toContain('GHOST RUN NEEDS HUMAN APPROVAL');
    const block = decisionFromRunResult(
      /** @type {any} */ ({
        ...warnResult,
        verdict: 'block',
        wardVerdict: { verdict: 'block', violations: [{ wardId: 'w1', wardKind: 'path', reason: 'would delete protected path data' }], notices: [] },
      }),
      { wardCount: 1 },
    );
    expect(block).toMatchObject({ kind: 'deny', exit: 2, stdout: '' });
  });
});
