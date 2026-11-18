/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXIT_BLOCK,
  EXIT_INVALID_INPUT,
  EXIT_PASS,
  EXIT_USAGE,
  EXIT_WARN,
  exitCodeFor,
} from '../../src/cli/exit';

// Node entry point tests. Validates: Requirements 11.8, 11.9, 18.4.

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const cliPath = join(appRoot, 'dist-node', 'cli.js');
const wardsPath = fileURLToPath(new URL('../../../../worlds/drawer-arm/wards.yaml', import.meta.url));
const firstPlan = join(appRoot, 'plans', 'first.plan.json');
const revisedPlan = join(appRoot, 'plans', 'revised.plan.json');

const CANARY = 'sk-CANARY-abc123';

interface Spawned {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[]): Spawned {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', cwd: appRoot, timeout: 150_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let tmp = '';
let canaryPlan = '';
let invalidPlan = '';
let invalidWards = '';

beforeAll(() => {
  if (!existsSync(cliPath)) {
    const built = spawnSync('corepack', ['pnpm', 'run', 'build:node'], { cwd: appRoot, encoding: 'utf8', timeout: 280_000 });
    if (built.status !== 0) throw new Error(`build:node failed: ${built.stderr}`);
  }
  tmp = mkdtempSync(join(tmpdir(), 'ghost-hand-cli-'));

  const plan = JSON.parse(readFileSync(revisedPlan, 'utf8')) as Record<string, unknown>;
  plan.note = `canary ${CANARY} reachable only through ghost.example`;
  canaryPlan = join(tmp, 'canary.plan.json');
  writeFileSync(canaryPlan, JSON.stringify(plan));

  invalidPlan = join(tmp, 'invalid.plan.json');
  writeFileSync(invalidPlan, JSON.stringify({ ...plan, unknownField: CANARY }));

  invalidWards = join(tmp, 'invalid.wards.yaml');
  writeFileSync(invalidWards, `# ${CANARY}\nwards: not-a-list\n`);

});

afterAll(() => {
  if (tmp !== '') rmSync(tmp, { recursive: true, force: true });
});

function expectNoFileContent(r: Spawned): void {
  const all = `${r.stdout}\n${r.stderr}`;
  expect(all).not.toContain(CANARY);
  expect(all).not.toContain('ghost.example');
}

describe('exitCodeFor', () => {
  it('maps pass, warn, and block to 0, 1, and 2', () => {
    expect(exitCodeFor('pass')).toBe(EXIT_PASS);
    expect(exitCodeFor('pass')).toBe(0);
    expect(exitCodeFor('warn')).toBe(EXIT_WARN);
    expect(exitCodeFor('warn')).toBe(1);
    expect(exitCodeFor('block')).toBe(EXIT_BLOCK);
    expect(exitCodeFor('block')).toBe(2);
  });
});

describe('ghost-hand-run', () => {
  it('exits 0 for the revised plan, prints the message, and keeps file content out', () => {
    const r = runCli([revisedPlan, '--wards', wardsPath]);
    expect(r.status).toBe(EXIT_PASS);
    expect(r.stdout.length).toBeGreaterThan(1);
    expect(r.stdout.endsWith('\n')).toBe(true);
    expect(r.stderr).toContain('Determinism self-check');
    expectNoFileContent(r);

    const withCanary = runCli([canaryPlan, '--wards', wardsPath]);
    expect(withCanary.status).toBe(EXIT_PASS);
    expectNoFileContent(withCanary);
  });

  it('exits 2 for the first plan; --json adds one line and leaves the message identical', () => {
    const plain = runCli([firstPlan, '--wards', wardsPath]);
    expect(plain.status).toBe(EXIT_BLOCK);
    expect(plain.stdout).toContain('gentle-hands');

    const json = runCli([firstPlan, '--wards', wardsPath, '--json']);
    expect(json.status).toBe(EXIT_BLOCK);
    const newline = json.stdout.indexOf('\n');
    const summary = JSON.parse(json.stdout.slice(0, newline)) as { verdict: string; wardIds: string[]; failedVariants: string[] };
    expect(summary.verdict).toBe('block');
    expect(summary.wardIds).toContain('gentle-hands');
    expect(Array.isArray(summary.failedVariants)).toBe(true);
    expect(json.stdout.slice(newline + 1)).toBe(plain.stdout);
    expectNoFileContent(plain);
    expectNoFileContent(json);
  });

  it('exits 64 for bad arguments', () => {
    const cases: string[][] = [
      [],
      [firstPlan],
      [firstPlan, '--wards'],
      [firstPlan, '--wards', wardsPath, '--bogus'],
      [firstPlan, '--wards', wardsPath, '--seed', 'abc'],
      [firstPlan, '--wards', wardsPath, '--variants', 'x'],
      ['validate'],
    ];
    for (const args of cases) {
      const r = runCli(args);
      expect(r.status, args.join(' ')).toBe(EXIT_USAGE);
      expect(r.stdout).toBe('');
    }
  });

  it('exits 65 for an invalid plan and for an invalid wards file, with errors on stderr only', () => {
    const badPlan = runCli([invalidPlan, '--wards', wardsPath]);
    expect(badPlan.status).toBe(EXIT_INVALID_INPUT);
    expect(badPlan.stdout).toBe('');
    expect(badPlan.stderr).toMatch(/\[[a-z-]+\]/);
    expectNoFileContent(badPlan);

    const badWards = runCli([revisedPlan, '--wards', invalidWards]);
    expect(badWards.status).toBe(EXIT_INVALID_INPUT);
    expect(badWards.stdout).toBe('');
    expect(badWards.stderr.length).toBeGreaterThan(0);
    expectNoFileContent(badWards);

    const missing = runCli([join(tmp, 'missing.plan.json'), '--wards', wardsPath]);
    expect(missing.status).toBe(EXIT_INVALID_INPUT);
    expect(missing.stdout).toBe('');
  });

  it('validate exits 0 with no output, or 65 with errors on stderr only', () => {
    for (const path of [firstPlan, revisedPlan, canaryPlan]) {
      const ok = runCli(['validate', path]);
      expect(ok.status).toBe(EXIT_PASS);
      expect(ok.stdout).toBe('');
      expect(ok.stderr).toBe('');
    }
    const bad = runCli(['validate', invalidPlan]);
    expect(bad.status).toBe(EXIT_INVALID_INPUT);
    expect(bad.stdout).toBe('');
    expect(bad.stderr.length).toBeGreaterThan(0);
    expectNoFileContent(bad);
  });
});
