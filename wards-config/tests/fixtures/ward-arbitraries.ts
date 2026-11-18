// Shared fast-check arbitraries for valid WardSet values.
// Test data policy: canary values only, reserved hostnames only, no hidden
// Unicode literals (all generated text is plain ASCII).

import * as fc from 'fast-check';
import type { Ward, WardSet } from '@ghost-run/core';

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

const word = (min = 1, max = 8): fc.Arbitrary<string> =>
  fc
    .array(fc.constantFrom(...ALNUM), { minLength: min, maxLength: max })
    .map((cs) => cs.join(''));

/** Ward id matching ^[a-z0-9][a-z0-9-]{0,63}$ (starts with a letter). */
export const wardIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.array(fc.constantFrom(...ALNUM, '-'), { maxLength: 10 }),
  )
  .map(([h, t]) => h + t.join(''));

/** One glob segment: literal word, `*`, `**`, `*.ext`, or `name?`. */
const globSegmentArb: fc.Arbitrary<string> = fc.oneof(
  word(),
  fc.constant('*'),
  fc.constant('**'),
  word(1, 5).map((w) => `*.${w}`),
  word(1, 5).map((w) => `${w}?`),
);

/** Valid glob: 1-4 segments; leading `/` is rejected by the schema (absolute-pattern). */
export const globArb: fc.Arbitrary<string> = fc
  .array(globSegmentArb, { minLength: 1, maxLength: 4 })
  .map((segs) => segs.join('/'));

const RESERVED_HOSTS = [
  'a.example',
  'api.example',
  'b.test',
  'svc.test',
  'app.localhost',
  'x.invalid',
  '192.0.2.1',
  '192.0.2.77',
  '[::1]',
  'registry.npmjs.org',
] as const;

/** Valid host entry from the reserved set (plus the npm registry example). */
export const hostArb: fc.Arbitrary<string> = fc.constantFrom(...RESERVED_HOSTS);

const tableArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')), word(0, 7))
  .map(([h, t]) => h + t);

/** Secret file glob/path, e.g. `.env` or `secrets/<word>.env`. */
const secretArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant('.env'),
  word(1, 6).map((w) => `secrets/${w}.env`),
);

const uniq = <T>(arb: fc.Arbitrary<T>, min: number, max: number): fc.Arbitrary<T[]> =>
  fc.uniqueArray(arb, { minLength: min, maxLength: max });

const pathWardBody = fc
  .record({
    deny: uniq(fc.constantFrom('delete' as const, 'overwrite' as const), 1, 2),
    paths: uniq(globArb, 1, 4),
    case_sensitive: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map(({ deny, paths, case_sensitive }) => (id: string): Ward => ({
    id,
    kind: 'path',
    deny,
    paths,
    ...(case_sensitive === undefined ? {} : { case_sensitive }),
  }));

const sqlWardBody = fc
  .record({
    tables: uniq(tableArb, 1, 4),
    max_rows_lost: fc.integer({ min: 0, max: 1000 }),
  })
  .map((b) => (id: string): Ward => ({ id, kind: 'sql', ...b }));

const egressWardBody = fc
  .record({
    secrets: uniq(secretArb, 1, 3),
    allow_hosts: uniq(hostArb, 0, 3),
  })
  .map((b) => (id: string): Ward => ({ id, kind: 'egress', ...b }));

const physicsWardBody = fc
  .record({
    min_success_rate: fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
    max_contact_force_n: fc.integer({ min: 1, max: 500 }),
    forbidden_contacts: uniq(word(1, 8), 0, 3),
  })
  .map((b) => (id: string): Ward => ({ id, kind: 'physics', ...b }));

const wardBodyArb = fc.oneof(pathWardBody, sqlWardBody, egressWardBody, physicsWardBody);

/** Valid single Ward (id supplied by the caller or generated). */
export const wardArb: fc.Arbitrary<Ward> = fc
  .tuple(wardIdArb, wardBodyArb)
  .map(([id, build]) => build(id));

const SAFE_TOKEN_CHARS = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  '_', '.', '/', ':', '=', '@', '%', '+', ',', '-',
];

const safeTokenArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 8, arbitrary: fc.array(fc.constantFrom(...SAFE_TOKEN_CHARS), { minLength: 1, maxLength: 12 }).map((cs) => cs.join('')) },
  { weight: 2, arbitrary: fc.constantFrom('0', '1e3', 'true', 'false', 'null', '.env', '-', '--flag=x', '@scope/pkg') },
);

/** One safe_commands entry: 1-256 chars, tokens over the charset joined by single spaces. */
export const safeCommandEntryArb: fc.Arbitrary<string> = fc
  .array(safeTokenArb, { minLength: 1, maxLength: 6 })
  .map((ts) => ts.join(' '))
  .filter((s) => s.length <= 256);

/** Valid safe_commands list: 0-256 distinct entries. */
export const safeCommandsArb: fc.Arbitrary<string[]> = fc.uniqueArray(safeCommandEntryArb, {
  minLength: 0,
  maxLength: 256,
});

/** Valid WardSet: 1-8 wards with unique ids, all four kinds reachable. */
export const wardSetArb: fc.Arbitrary<WardSet> = fc
  .uniqueArray(wardArb, {
    minLength: 1,
    maxLength: 8,
    selector: (w) => w.id,
  })
  .map((wards) => ({ wards }));
