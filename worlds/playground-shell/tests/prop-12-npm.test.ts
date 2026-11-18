import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine, type LineResult, type RunTrace } from '../src/shell/interpret.js';
import type { Entry, VirtualProject } from '../src/state.js';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from './pbt-config.js';
import { arbCommandLine } from './support/arb-commands.js';
import { arbVirtualProject } from './support/arb-project.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const ENCODER = new TextEncoder();
const scriptName = fc.stringMatching(/^[a-z][a-z0-9:_-]{0,8}$/);
const word = fc.stringMatching(/^[a-z0-9]{1,6}$/);

/** Supported_Commands outside the file commands: network attempts (reserved hosts only). */
const arbNetworkCommand = fc.oneof(
  fc.constant('npm install'),
  fc.constant('npm ci'),
  word.map((w) => `curl -s -d ${w} https://api.example/${w}`),
);

/** A script text: a supported line over the project, optionally followed by a network command. */
function arbScriptText(project: VirtualProject): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 4, arbitrary: arbCommandLine(project) },
    { weight: 1, arbitrary: arbNetworkCommand },
    {
      weight: 1,
      arbitrary: fc
        .tuple(arbCommandLine(project), fc.constantFrom(';', '&&'), arbNetworkCommand)
        .map(([a, op, b]) => `${a} ${op} ${b}`),
    },
  );
}

function packageJson(scripts: Record<string, string>): Entry {
  return { kind: 'file', bytes: ENCODER.encode(JSON.stringify({ name: 'demo', scripts })) };
}

interface Observation {
  result: Pick<LineResult, 'exitCode' | 'stdout' | 'stderr' | 'unsupportedReason' | 'watchdog'>;
  entries: [string, string][];
  network: string[];
  reads: string[];
}

/** Runs `line` on a fresh copy of `entries` and records everything observable. */
async function observe(entries: Record<string, Entry>, line: string): Promise<Observation> {
  const network: string[] = [];
  const reads: string[] = [];
  const trace: RunTrace = {
    recordRead: (p) => {
      reads.push(p);
    },
    recordNetwork: (dest, body) => {
      network.push(`${dest}|${body === undefined ? '' : Array.from(body).join(',')}`);
    },
    markWatchdog: () => undefined,
  };
  const { fs, env } = makeTestEnv(entries, { trace });
  const r = await runLine(line, env);
  const out: [string, string][] = fs.walk('').map((p) => {
    const e = fs.get(p) as Entry;
    return [p, e.kind === 'dir' ? 'dir' : `file:${Array.from(e.bytes).join(',')}:${JSON.stringify(e.tables ?? null)}`];
  });
  return {
    result: {
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
      unsupportedReason: r.unsupportedReason,
      watchdog: r.watchdog,
    },
    entries: out,
    network,
    reads,
  };
}

const withPackage = (project: VirtualProject, scripts: Record<string, string>) => ({
  ...project.entries,
  'package.json': packageJson(scripts),
});

describe('Property 12: npm script expansion equals direct execution', () => {
  const tick = makeYielder();

  it(
    '`npm run <name>` and `npm test` give the same Changes and events as the script text',
    async () => {
      // Feature: ghost-shell, Property 12: npm script expansion equals direct execution
      // **Validates: Requirements 5.4, 5.5, 11.9**
      await fc.assert(
        fc.asyncProperty(
          arbVirtualProject.chain((project) =>
            fc.record({
              project: fc.constant(project),
              name: scriptName,
              text: arbScriptText(project),
              testText: arbScriptText(project),
            }),
          ),
          async ({ project, name, text, testText }) => {
            await tick();
            const entries = withPackage(project, { [name]: text, test: testText });
            const direct = await observe(entries, text);
            const viaNpm = await observe(entries, `npm run ${name}`);
            expect(viaNpm).toEqual(direct);

            const directTest = await observe(entries, testText);
            const shortcut = await observe(entries, 'npm test');
            const viaRun = await observe(entries, 'npm run test');
            expect(shortcut).toEqual(directTest);
            expect(shortcut).toEqual(viaRun);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a missing script or an unreadable package.json fails with exit code 1 and no unsupported flag',
    async () => {
      // Feature: ghost-shell, Property 12: npm script expansion equals direct execution
      // **Validates: Requirements 5.4, 5.5, 11.9**
      const unreadable: fc.Arbitrary<Entry | undefined> = fc.oneof(
        fc.constant(undefined),
        fc.constantFrom('', '{', 'not json', '[]', '"s"', 'null', '{"scripts":[]}', '{"scripts":"x"}').map(
          (t): Entry => ({ kind: 'file', bytes: ENCODER.encode(t) }),
        ),
        fc.constant<Entry>({ kind: 'file', bytes: new Uint8Array([0xff, 0xfe, 0x7b]) }),
        fc.constant<Entry>({ kind: 'dir' }),
      );
      await fc.assert(
        fc.asyncProperty(
          arbVirtualProject,
          scriptName,
          scriptName,
          word,
          unreadable,
          fc.constantFrom<'missing' | 'unreadable' | 'non-string'>('missing', 'unreadable', 'non-string'),
          async (project, other, wanted, w, bad, mode) => {
            await tick();
            fc.pre(other !== wanted);
            const entries: Record<string, Entry> = { ...project.entries };
            let expectedErr: string;
            if (mode === 'unreadable') {
              if (bad !== undefined) entries['package.json'] = bad;
              expectedErr = 'package.json unreadable\n';
            } else if (mode === 'missing') {
              entries['package.json'] = packageJson({ [other]: `echo ${w}` });
              expectedErr = `Missing script: ${wanted}\n`;
            } else {
              entries['package.json'] = {
                kind: 'file',
                bytes: ENCODER.encode(JSON.stringify({ scripts: { [wanted]: 5 } })),
              };
              expectedErr = `Missing script: ${wanted}\n`;
            }
            const run = await observe(entries, `npm run ${wanted}`);
            expect(run.result.exitCode).toBe(1);
            expect(run.result.stderr).toBe(expectedErr);
            expect(run.result.stdout).toBe('');
            expect(run.result.unsupportedReason).toBeUndefined();
            expect(run.network).toEqual([]);
            const before = await observe(entries, 'true');
            expect(run.entries).toEqual(before.entries);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: `npm run clean` has the Changes of `rm -rf data`', async () => {
    const entries: Record<string, Entry> = {
      data: { kind: 'dir' },
      'data/a.txt': { kind: 'file', bytes: new Uint8Array([1]) },
      'package.json': packageJson({ clean: 'rm -rf data' }),
    };
    const direct = await observe(entries, 'rm -rf data');
    const viaNpm = await observe(entries, 'npm run clean');
    expect(viaNpm).toEqual(direct);
    expect(viaNpm.entries.map(([p]) => p)).toEqual(['package.json']);
  });

  it('fixed example: missing script and unreadable package.json', async () => {
    const missing = await observe({ 'package.json': packageJson({}) }, 'npm test');
    expect(missing.result.exitCode).toBe(1);
    expect(missing.result.stderr).toBe('Missing script: test\n');
    const bad = await observe({ 'package.json': { kind: 'file', bytes: ENCODER.encode('{') } }, 'npm run x');
    expect(bad.result.stderr).toBe('package.json unreadable\n');
    expect(bad.result.unsupportedReason).toBeUndefined();
  });
});
