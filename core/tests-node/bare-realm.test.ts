// Bare node:vm realm test (Requirements 1.2, 1.3, 1.5).
//
// The possession module is evaluated in a context with only the ECMAScript built-ins and
// compared with the host build. Results cross the realm boundary as JSON strings, because
// objects from another realm have other prototypes and deepEqual would not match them.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import * as host from '../src/possession/index.js';
import type { ProvenanceRecord, ScanInput } from '../src/possession/types.js';
import {
  anyText,
  asciiReporter,
  ghostReportPart,
  provenanceLog,
  scanInputs,
} from '../tests/possession/arbitraries.js';
import { NUM_RUNS, PBT_TIMEOUT } from '../tests/pbt-config.js';
import { loadBareRealm, type BareRealm } from './bare-realm-loader.js';

type Fn = (...args: unknown[]) => unknown;

const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const json = (value: unknown): string => JSON.stringify(value);

let realm: BareRealm;
let api: Record<string, Fn>;

beforeAll(() => {
  realm = loadBareRealm();
  api = realm.api as Record<string, Fn>;
});

/** Run the same call in the realm and on the host; return both results as JSON strings. */
function both(
  name: keyof typeof host,
  ...args: unknown[]
): { inRealm: string; onHost: string } {
  const hostFn = host[name] as unknown as Fn;
  const realmFn = api[name] as Fn;
  return {
    inRealm: json(realmFn(...args.map((a) => (typeof a === 'string' ? a : realm.toRealm(a))))),
    onHost: json(hostFn(...args)),
  };
}

function expectSame(name: keyof typeof host, ...args: unknown[]): void {
  const { inRealm, onHost } = both(name, ...args);
  expect(inRealm).toBe(onHost);
}

describe('bare realm: environment', () => {
  it('exposes no Node or DOM global', () => {
    for (const g of [
      'process',
      'Buffer',
      'require',
      'URL',
      'TextEncoder',
      'TextDecoder',
      'fetch',
      'window',
      'document',
      'setTimeout',
    ]) {
      expect(realm.evaluate(`typeof ${g}`), g).toBe('undefined');
    }
  });

  it('throws ReferenceError on any Node or DOM global use', () => {
    for (const g of ['process', 'Buffer', 'URL', 'TextEncoder', 'window', 'document']) {
      let caught: { name?: string } | undefined;
      try {
        realm.evaluate(g);
      } catch (error) {
        caught = error as { name?: string };
      }
      expect(caught?.name, g).toBe('ReferenceError');
    }
  });

  it('loads every module, both generated tables included, and exposes the public API', () => {
    expect([...realm.modules.keys()]).toEqual(
      expect.arrayContaining([
        'classify',
        'emoji',
        'emoji-table.generated',
        'entry',
        'index',
        'provenance',
        'red-thread',
        'sanitize',
        'scan',
        'search',
        'tag-sequence',
        'tag-sequence-table.generated',
        'types',
      ]),
    );
    expect(Object.keys(api).sort()).toEqual(Object.keys(host).sort());
  });
});

describe('bare realm: example battery', () => {
  const zwjFamily = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
  const england = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
  const hiddenTags = cp(0xe0068, 0xe0069);
  const opener = cp(0x3c, 0x21, 0x2d, 0x2d);
  const closer = cp(0x2d, 0x2d, 0x3e);
  const texts = [
    '',
    'plain ASCII text\nsecond line\r\nthird line',
    cp(0xd55c, 0xae00) + ' hangul',
    zwjFamily,
    england,
    england + hiddenTags,
    'a' + cp(0x200b) + 'b' + cp(0x202e) + 'c' + cp(0xfeff),
    'x' + hiddenTags + 'y',
    'before ' + opener + ' hidden note ' + closer + ' after',
    opener + ' unterminated',
    'lone ' + cp(0xd800) + ' surrogate',
    cp(0x1f600) + cp(0x200d) + 'z',
  ];

  it('scanText and sanitizeText agree in both modes', () => {
    for (const text of texts) {
      expectSame('scanText', text);
      expectSame('scanText', text, { markdown: false });
      expectSame('sanitizeText', text);
    }
  });

  it('scanText finds the planted code points', () => {
    const result = JSON.parse(json(api['scanText']?.('a' + cp(0x200b) + 'b'))) as {
      findings: { category: string }[];
    };
    expect(result.findings.map((f) => f.category)).toEqual(['zero-width']);
  });

  it('provenance serialize and parse agree', () => {
    const log: ProvenanceRecord[] = [
      { source: 'notes.example', kind: 'file', content: 'host db.example' },
      { source: 'page.test', kind: 'web', content: 'x' + hiddenTags },
    ];
    const serialized = host.serializeProvenanceLog(log);
    expect(json(api['serializeProvenanceLog']?.(realm.toRealm(log)))).toBe(json(serialized));
    expectSame('parseProvenanceLog', serialized);
    expectSame('parseProvenanceLog', '{"not":"an array"}');
    expectSame('parseProvenanceLog', '[{"source":"","kind":"x","content":1}]');
    expectSame('parseProvenanceLog', 'not json');
  });

  it('entry point functions agree', () => {
    const inputs: ScanInput[] = [
      { path: 'a.md', text: opener + ' c ' + closer },
      { path: 'b.txt', text: 'x' + cp(0x200b) },
      { path: 'c.txt', text: 'clean' },
    ];
    expectSame('scanTexts', inputs);
    const report = host.scanTexts(inputs);
    expectSame('formatReport', report);
    for (const outcome of ['clean', 'findings', 'error'] as const) {
      expect(api['exitCodeFor']?.(outcome)).toBe(host.exitCodeFor(outcome));
    }
  });
});

describe('bare realm: differential', () => {
  const params = { numRuns: NUM_RUNS, reporter: asciiReporter };
  const timeout = PBT_TIMEOUT ?? 0;

  it(
    'scanText and sanitizeText agree over anyText',
    () => {
      fc.assert(
        fc.property(anyText, fc.boolean(), (text, markdown) => {
          const a = both('scanText', text, { markdown });
          const b = both('sanitizeText', text, { markdown });
          return a.inRealm === a.onHost && b.inRealm === b.onHost;
        }),
        params,
      );
    },
    timeout,
  );

  it(
    'provenance and red thread agree over provenanceLog',
    () => {
      fc.assert(
        fc.property(provenanceLog, ghostReportPart, (log, part) => {
          const serialized = host.serializeProvenanceLog(log);
          const s = both('serializeProvenanceLog', log);
          const p = both('parseProvenanceLog', serialized);
          const needles = host.collectNeedles(part);
          const c = both('collectNeedles', part);
          const t = both('traceRedThread', log, needles);
          return (
            s.inRealm === s.onHost &&
            p.inRealm === p.onHost &&
            c.inRealm === c.onHost &&
            t.inRealm === t.onHost
          );
        }),
        params,
      );
    },
    timeout,
  );

  it(
    'scanTexts and formatReport agree over scanInputs',
    () => {
      fc.assert(
        fc.property(scanInputs, (inputs) => {
          const s = both('scanTexts', inputs);
          const f = both('formatReport', host.scanTexts(inputs));
          return s.inRealm === s.onHost && f.inRealm === f.onHost;
        }),
        params,
      );
    },
    timeout,
  );
});
