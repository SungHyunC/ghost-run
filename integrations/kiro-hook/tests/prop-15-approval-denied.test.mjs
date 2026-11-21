// Feature: kiro-integration, Property 15: Approval commands are denied
// **Validates: Requirements 10.5, 10.10**
// No Docker needed [no-docker]: `runPlan` is a double that must never be called.
import fc from 'fast-check';
import fsp from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_COMMAND_LINE, decide } from '../lib/gate/decide.mjs';
import { createGateStore } from '../lib/store/gate-store.mjs';
import { makeHookEvent, makeTempStore, shellEvent, writeEvent } from './fixtures/index.mjs';
import { makeMemTree } from './fixtures/mem-tree.mjs';
import { FC_PARAMS, FILE_TIMEOUT_MS } from './pbt-config.mjs';

const FIXED_NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const wardSet = {
  wards: [{ id: 'protect-data', kind: 'path', deny: ['delete', 'overwrite'], paths: ['data/**'] }],
};
const loadOk = async () => ({ ok: /** @type {const} */ (true), wardSet, safeCommands: [], file: 'wards.yaml' });

/** @type {ReturnType<typeof makeTempStore>} */
let tmp;
/** @type {string} */
let root;
beforeEach(async () => {
  tmp = makeTempStore();
  root = path.join(tmp.dir, 'ws');
  await fsp.mkdir(root, { recursive: true });
});
afterEach(() => tmp.cleanup());

/** Every filesystem path that the gate asked the view about. */
function recordingView() {
  /** @type {string[]} */
  const seen = [];
  const inner = makeMemTree({ [root]: { dir: true } });
  const view = {
    /** @param {string} p */
    async lstat(p) { seen.push(p); return inner.lstat(p); },
    /** @param {string} p */
    async realpath(p) { seen.push(p); return inner.realpath(p); },
    /** @param {string} p */
    async readdir(p) { seen.push(p); return inner.readdir(p); },
  };
  return { view, seen };
}

/** @param {unknown} ev */
async function run(ev) {
  const runPlan = vi.fn(async () => {
    throw new Error('runPlan must not be called');
  });
  const { view, seen } = recordingView();
  const decision = await decide(
    { stdin: JSON.stringify(ev), root, env: {}, elapsedSec: 0 },
    {
      loadWards: /** @type {any} */ (loadOk),
      clock: () => FIXED_NOW,
      uuid: () => 'run-fixed_1',
      store: createGateStore(root),
      fsView: /** @type {any} */ (view),
      runPlan: /** @type {any} */ (runPlan),
    },
  );
  return { decision, runPlan, seen };
}

/** Random upper/lower case per character. */
const mixCase = (/** @type {string} */ s, /** @type {boolean[]} */ flags) =>
  [...s].map((c, i) => (flags[i % flags.length] ? c.toUpperCase() : c.toLowerCase())).join('');

const flagsArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 16 });
const idArb = fc.constantFrom('g-run-1', 'abc', 'g-0123', 'x_y-z');
const sepArb = fc.constantFrom(' ', '-');

/** The approval command in a spelling the guard must recognize: mixed case, with or without a dash. */
const nameArb = fc
  .tuple(flagsArb, sepArb)
  .map(([flags, sep]) => mixCase(`ghost-run${sep}approve`, flags));

/** Insert a quote character at a position that does not touch the separator (quote splitting). */
const quotedArb = fc
  .tuple(nameArb, fc.constantFrom("'", '"', '`'), fc.integer({ min: 1, max: 8 }))
  .map(([name, q, at]) => name.slice(0, at) + q + q + name.slice(at));

const coreArb = fc.oneof(nameArb, quotedArb);

/** Wrapper forms around the approval command. */
const commandArb = fc
  .tuple(coreArb, idArb, fc.integer({ min: 0, max: 5 }))
  .map(([core, id, form]) => {
    const inner = `${core} ${id}`;
    switch (form) {
      case 0: return inner;
      case 1: return `sh -c '${inner.replace(/'/g, '')}'`;
      case 2: return `env X=1 ${inner}`;
      case 3: return `echo hi; ${inner} && echo done`;
      case 4: return `printf '%s\\n' '${inner.replace(/'/g, '')}' > /tmp/x.sh; sh /tmp/x.sh`; // script written by the same call
      default: return `bash -c "${inner.replace(/"/g, '')}"`;
    }
  });

/** A command line built by concatenation inside one call: the two halves are adjacent quoted words. */
const concatArb = fc
  .tuple(fc.constantFrom('ghost-run', 'GHOST-RUN', 'Ghost-Run'), idArb)
  .map(([head, id]) => `cmd="${head}"' 'approve; '${head}' "appr""ove" ${id}`);

const writeTargetArb = fc
  .tuple(fc.constantFrom('write', 'append', 'replace', 'delete'), idArb, fc.constantFrom('', './', 'sub/../'))
  .map(([tool, id, pre]) => {
    const rel = `${pre}.ghost-run/approvals/${id}.json`;
    switch (tool) {
      case 'write': return writeEvent(rel, '{}');
      case 'append': return makeHookEvent('fs_append', { path: rel, text: '{}' });
      case 'replace': return makeHookEvent('str_replace', { path: rel, oldStr: 'a', newStr: 'b' });
      default: return makeHookEvent('delete_file', { targetFile: rel });
    }
  });

describe('Property 15: approval commands are denied', { timeout: FILE_TIMEOUT_MS }, () => {
  it('a shell call with the approval command in any wrapper form is denied with exit 2 and the rule message', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(commandArb, concatArb), async (command) => {
        const { decision, runPlan, seen } = await run(shellEvent(command, { cwd: root }));
        expect(decision).toMatchObject({ kind: 'deny', exit: 2, stdout: '', stderr: APPROVAL_COMMAND_LINE });
        expect(decision.stderr).toContain('approval-command');
        expect(runPlan).not.toHaveBeenCalled();
        expect(seen.filter((p) => p.includes('approvals'))).toEqual([]);
      }),
      { ...FC_PARAMS, numRuns: Math.max(FC_PARAMS.numRuns, 100) },
    );
  });

  it('a write tool call that targets .ghost-run/approvals/ is never allowed and is not ghosted (host prompt in ask mode)', async () => {
    await fc.assert(
      fc.asyncProperty(writeTargetArb, async (ev) => {
        const { decision, runPlan } = await run({ ...ev, cwd: root });
        // The gate reads no approval state, so a write there is only a Self_Protected_Path warn: with the
        // committed WARN_MODE 'ask' the human answers the host prompt; the call is never an allow.
        expect(decision.kind).toBe('ask');
        expect(decision.exit).toBe(0);
        expect(decision.stderr).toBe('');
        expect(JSON.parse(decision.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
        expect(decision.stdout).not.toContain('"allow"');
        expect(runPlan).not.toHaveBeenCalled();
      }),
      { ...FC_PARAMS, numRuns: Math.max(FC_PARAMS.numRuns, 100) },
    );
  });

  it('no gate module reads approval state (source scan of ghost-gate.mjs and lib/)', () => {
    const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    /** @type {string[]} */
    const files = [path.join(base, 'ghost-gate.mjs')];
    for (const dir of ['lib', 'lib/gate', 'lib/store']) {
      for (const f of readdirSync(path.join(base, dir))) if (f.endsWith('.mjs')) files.push(path.join(base, dir, f));
    }
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Only the fixed deny-rule name may appear; no path to an approvals folder is built or read.
      expect(code, path.relative(base, file)).not.toMatch(/approvals/i);
      expect(code, path.relative(base, file)).not.toMatch(/\.ghost-run['"`/]\s*,?\s*['"`]?approv/i);
    }
  });

  it('example: the reserved command in a wrapper is denied, and an unrelated command is not matched', async () => {
    const hit = await run(shellEvent("sh -c 'GHOST-RUN Approve g-1'", { cwd: root }));
    expect(hit.decision).toMatchObject({ kind: 'deny', exit: 2, stderr: APPROVAL_COMMAND_LINE });
    const w = await run({ ...writeEvent('.ghost-run/approvals/g-1.json', '{}'), cwd: root });
    expect(w.decision).toMatchObject({ kind: 'ask', exit: 0 });
  });
});
