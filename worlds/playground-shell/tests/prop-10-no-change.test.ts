import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runLine } from '../src/shell/interpret.js';
import type { Entry, PlaygroundState } from '../src/state.js';
import { diffStates } from '../src/vfs/diff.js';
import { NUM_RUNS, PBT_TIMEOUT, makeYielder } from './pbt-config.js';
import { arbVirtualProject } from './support/arb-project.js';
import { makeTestEnv } from './support/env.js';
import './support/setup.js';

// Each property failure prints the fast-check seed and counterexample (fc.assert report).

const ENCODER = new TextEncoder();
const segment = fc.stringMatching(/^[a-z][a-z0-9_-]{0,5}$/);
/** Echo-safe text: no quotes, spaces, redirect characters, or leading dash. */
const text = fc.stringMatching(/^[a-z0-9]{0,12}$/);
const arbTables = fc.option(fc.dictionary(segment, fc.nat({ max: 50 }), { maxKeys: 3 }), {
  nil: undefined,
});

function file(bytes: Uint8Array, tables?: Record<string, number>): Entry {
  return tables === undefined ? { kind: 'file', bytes } : { kind: 'file', bytes, tables };
}

/** A state holding the directory chain of `dirs` and the given files. */
function stateWith(dirs: string[], files: Record<string, Entry>): PlaygroundState {
  const entries: Record<string, Entry> = {};
  for (let i = 1; i <= dirs.length; i++) entries[dirs.slice(0, i).join('/')] = { kind: 'dir' };
  return { entries: { ...entries, ...files } };
}

const join = (dirs: string[], leaf: string): string => [...dirs, leaf].join('/');

/** Runs the lines in order on one copy; returns the state after each line. */
async function runAll(before: PlaygroundState, lines: string[]): Promise<PlaygroundState[]> {
  const { fs, env } = makeTestEnv(before.entries);
  const states: PlaygroundState[] = [];
  for (const line of lines) {
    await runLine(line, env);
    states.push(fs.toState());
  }
  return states;
}

describe('Property 10: identical writes and observation-only steps leave no Change', () => {
  const tick = makeYielder();

  it(
    '`echo` with redirect and `cp` of an identical file yield an empty diff',
    async () => {
      // Feature: ghost-shell, Property 10: Identical writes and observation-only steps leave no Change
      // **Validates: Requirements 3.14, 4.6**
      await fc.assert(
        fc.asyncProperty(
          fc.array(segment, { maxLength: 3 }),
          segment,
          segment,
          text,
          fc.boolean(),
          arbTables,
          arbTables,
          fc.constantFrom<'echo' | 'cp'>('echo', 'cp'),
          async (dirs, leafA, leafB, content, newline, tablesA, tablesB, mode) => {
            await tick();
            fc.pre(leafA !== leafB);
            const bytes = ENCODER.encode(newline ? `${content}\n` : content);
            const a = join(dirs, leafA);
            const b = join(dirs, leafB);
            const echoLine = `echo ${newline ? '' : '-n '}${content} > ${a}`;
            const before =
              mode === 'echo'
                ? stateWith(dirs, { [a]: file(bytes, tablesA ?? undefined) })
                : stateWith(dirs, {
                    [a]: file(bytes, tablesA ?? undefined),
                    [b]: file(bytes.slice(), tablesB ?? undefined),
                  });
            const line = mode === 'echo' ? echoLine : `cp ${a} ${b}`;
            const [after] = await runAll(before, [line]);
            expect(diffStates(before, after as PlaygroundState)).toEqual([]);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it(
    'a plan of only `curl` and `npm install` steps leaves the state equal and every step diff empty',
    async () => {
      // Feature: ghost-shell, Property 10: Identical writes and observation-only steps leave no Change
      // **Validates: Requirements 3.14, 4.6**
      await fc.assert(
        fc.asyncProperty(
          arbVirtualProject.chain((project) => {
            const files = Object.entries(project.entries)
              .filter(([, e]) => e.kind === 'file')
              .map(([p]) => p);
            const dataFile =
              files.length > 0 ? fc.constantFrom(...files) : fc.constant('missing.txt');
            const step = fc.oneof(
              fc.constantFrom('npm install', 'npm i', 'npm ci'),
              fc.constant('curl https://api.example/'),
              text.map((t) => `curl -s -d ${t === '' ? 'x' : t} https://api.example/${t}`),
              fc.constantFrom('GET', 'POST').map((m) => `curl -X ${m} http://svc.test/health`),
              dataFile.map((f) => `curl -s -d @${f} https://upload.example/in`),
              fc.constant('curl -d @no-such-file.txt https://upload.example/in'),
            );
            return fc.record({
              project: fc.constant(project),
              steps: fc.array(step, { minLength: 1, maxLength: 6 }),
            });
          }),
          async ({ project, steps }) => {
            await tick();
            const before: PlaygroundState = { entries: project.entries };
            const states = await runAll(before, steps);
            let previous = before;
            for (const s of states) {
              expect(diffStates(previous, s)).toEqual([]);
              previous = s;
            }
            expect(previous).toEqual(before);
            expect(diffStates(before, previous)).toEqual([]);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    PBT_TIMEOUT,
  );

  it('fixed example: identical echo, identical cp, and a failed curl', async () => {
    const bytes = ENCODER.encode('hello\n');
    const before = stateWith([], { 'a.txt': file(bytes), 'b.txt': file(bytes.slice()) });
    const [afterEcho, afterCp, afterCurl, afterNpm] = await runAll(before, [
      'echo hello > a.txt',
      'cp a.txt b.txt',
      'curl -s -d @a.txt https://upload.example/in',
      'npm install',
    ]);
    for (const s of [afterEcho, afterCp, afterCurl, afterNpm]) {
      expect(diffStates(before, s as PlaygroundState)).toEqual([]);
    }
    const changed = await runAll(before, ['echo other > a.txt']);
    expect(diffStates(before, changed[0] as PlaygroundState)).toEqual([
      { kind: 'file-overwritten', path: 'a.txt', sizeBefore: 6, sizeAfter: 6 },
    ]);
  });
});
