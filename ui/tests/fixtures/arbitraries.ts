// Generators for the ui-kit property tests (design.md, "Generators").
// Test-only. Hidden characters are always built from code points, never written literally.
// Hosts are reserved (.example, .invalid); secrets are canary values only.
import * as fc from 'fast-check';
import { scanText } from '@ghost-run/core';
import type {
  Change,
  Finding,
  Needle,
  ScanResult,
  ThreadLink,
  WardNotice,
  WardVerdict,
} from '@ghost-run/core';
import type {
  BlacklightSource,
  GraveDetail,
  GraveEntry,
  IsolationClaims,
} from '../../src/types';

// ---------------------------------------------------------------------------
// Hidden characters and hostile strings
// ---------------------------------------------------------------------------

const cp = (n: number): string => String.fromCodePoint(n);

/** Tag characters, zero-width, bidi, and the control ranges (C0 and C1). */
export const hiddenCodePoint: fc.Arbitrary<string> = fc
  .oneof(
    fc.integer({ min: 0xe0000, max: 0xe007f }),
    fc.constantFrom(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff),
    fc.integer({ min: 0x202a, max: 0x202e }),
    fc.integer({ min: 0x2066, max: 0x2069 }),
    fc.integer({ min: 0, max: 0x1f }),
    fc.integer({ min: 0x7f, max: 0x9f }),
  )
  .map(cp);

/** A lone surrogate (unpaired when inserted between non-surrogates). */
export const loneSurrogate: fc.Arbitrary<string> = fc
  .integer({ min: 0xd800, max: 0xdfff })
  .map((n) => String.fromCharCode(n));

/** Code points the possession scanner flags (tag, zero-width, bidi); no controls. */
const scannedHiddenCodePoint: fc.Arbitrary<string> = fc
  .oneof(
    fc.integer({ min: 0xe0000, max: 0xe007f }),
    fc.constantFrom(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff),
    fc.integer({ min: 0x202a, max: 0x202e }),
    fc.integer({ min: 0x2066, max: 0x2069 }),
  )
  .map(cp);

const EMOJI_NEIGHBORS: readonly string[] = [cp(0x1f600), cp(0x1f468), cp(0x1f469), cp(0x2764)];

/** `base` with 0 to 5 hidden characters (or lone surrogates) inserted at arbitrary positions. */
export function dirtyString(base: fc.Arbitrary<string> = fc.string()): fc.Arbitrary<string> {
  const insert = fc.oneof(
    { weight: 8, arbitrary: hiddenCodePoint },
    { weight: 1, arbitrary: loneSurrogate },
    {
      weight: 1,
      arbitrary: fc
        .tuple(fc.constantFrom(...EMOJI_NEIGHBORS), fc.constantFrom(...EMOJI_NEIGHBORS))
        .map(([a, b]) => a + cp(0x200d) + b),
    },
  );
  return fc
    .tuple(base, fc.array(fc.tuple(insert, fc.nat()), { minLength: 0, maxLength: 5 }))
    .map(([s, inserts]) => {
      let out = Array.from(s);
      for (const [piece, at] of inserts) {
        const pos = at % (out.length + 1);
        out = [...out.slice(0, pos), piece, ...out.slice(pos)];
      }
      return out.join('');
    });
}

const COMMENT_OPEN = cp(0x3c) + cp(0x21) + cp(0x2d) + cp(0x2d);
const HOSTILE_SAMPLES: readonly string[] = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "' onmouseover='alert(1)",
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  '<svg onload=alert(1)>',
  '<iframe src="https://frame.example/"></iframe>',
  '<a href="javascript:void(0)">x</a>',
  '<style>body{display:none}</style>',
  '<template><b>x</b></template>',
  '<img src="https://pixel.invalid/p.png">',
  '&lt;b&gt;&amp;&quot;',
  '</div></span>',
  `${COMMENT_OPEN} hidden note`,
];

/** Strings that try to break out of text or attribute context. */
export const markupString: fc.Arbitrary<string> = fc
  .tuple(fc.string({ maxLength: 12 }), fc.constantFrom(...HOSTILE_SAMPLES), fc.string({ maxLength: 12 }))
  .chain(([a, hostile, b]) =>
    fc.constantFrom(hostile, a + hostile, hostile + b, a + hostile + b),
  );

// ---------------------------------------------------------------------------
// Canary values, keys, and generic values
// ---------------------------------------------------------------------------

/** `sk-CANARY-` followed by 1 to 40 characters of [A-Za-z0-9_-]. */
export const canary: fc.Arbitrary<string> = fc
  .stringMatching(/^[A-Za-z0-9_-]{1,40}$/)
  .map((s) => `sk-CANARY-${s}`);

/** Independent copy of the eleven secret-like words (does not import src/). */
export const SECRET_WORDS: readonly string[] = [
  'secret',
  'token',
  'password',
  'passwd',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'credential',
  'private_key',
  'session',
];

/** Independent one-line oracle for the secret-like key rule. */
export function secretLikeOracle(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_WORDS.some((w) => k.includes(w));
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function mixedCase(s: string, mask: number): string {
  return Array.from(s)
    .map((c, i) => ((mask >> (i % 20)) & 1 ? c.toUpperCase() : c.toLowerCase()))
    .join('');
}

const affix = fc.stringMatching(/^[A-Za-z0-9_-]{0,6}$/);

/** A key that contains one of the eleven words (any of four letter-case variants, optional affixes). */
export const secretLikeKey: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...SECRET_WORDS),
    fc.integer({ min: 0, max: 3 }),
    fc.integer({ min: 0, max: (1 << 20) - 1 }),
    affix,
    affix,
  )
  .map(([word, variant, mask, prefix, suffix]) => {
    const cased =
      variant === 0
        ? word.toLowerCase()
        : variant === 1
          ? word.toUpperCase()
          : variant === 2
            ? capitalize(word)
            : mixedCase(word, mask);
    return prefix + cased + suffix;
  })
  .filter(secretLikeOracle);

/** A key that contains none of the eleven words (filtered by the independent oracle). */
export const plainKey: fc.Arbitrary<string> = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,8}$/)
  .filter((k) => !secretLikeOracle(k));

const visibleMarker: fc.Arbitrary<string> = fc
  .stringMatching(/^[0-9]{1,6}$/)
  .map((d) => `visible-${d}`);

type Rec = Record<string, unknown>;

function toRecord(entries: readonly (readonly [string, unknown])[]): Rec {
  const out: Rec = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

/** A value under a secret-like key: a canary, or a nested subtree holding canaries under any key. */
function secretSubtree(depth: number): fc.Arbitrary<unknown> {
  if (depth <= 0) return canary;
  const inner = secretSubtree(depth - 1);
  return fc.oneof(
    { weight: 3, arbitrary: canary },
    {
      weight: 1,
      arbitrary: fc
        .array(fc.tuple(fc.oneof(plainKey, secretLikeKey), inner), { maxLength: 3 })
        .map(toRecord),
    },
    { weight: 1, arbitrary: fc.array(canary, { maxLength: 3 }) },
  );
}

function genericRecord(depth: number): fc.Arbitrary<Rec> {
  const plainValue: fc.Arbitrary<unknown> =
    depth <= 0
      ? fc.oneof(visibleMarker, fc.integer(), fc.boolean())
      : fc.oneof(
          { weight: 3, arbitrary: visibleMarker },
          { weight: 1, arbitrary: fc.integer() },
          { weight: 1, arbitrary: fc.boolean() },
          { weight: 2, arbitrary: genericRecord(depth - 1) },
          { weight: 1, arbitrary: fc.array(genericRecord(depth - 1), { maxLength: 3 }) },
        );
  const entry: fc.Arbitrary<readonly [string, unknown]> = fc.oneof(
    { weight: 3, arbitrary: fc.tuple(plainKey, plainValue) },
    { weight: 1, arbitrary: fc.tuple(secretLikeKey, secretSubtree(Math.min(depth, 3))) },
  );
  return fc.array(entry, { maxLength: 4 }).map(toRecord);
}

/**
 * A record (depth up to `maxDepth`, default 6). Secret-like keys hold a canary or a subtree of
 * canaries; every plain key outside a secret-like subtree holds `visible-<digits>` or a
 * non-string primitive or a nested container.
 */
export function genericValue(maxDepth = 6): fc.Arbitrary<Record<string, unknown>> {
  return genericRecord(maxDepth);
}

export const KNOWN_CHANGE_KINDS: readonly string[] = [
  'file-created',
  'file-overwritten',
  'file-deleted',
  'symlink-changed',
  'sql-row-count',
];

/** A change whose kind is outside the five known kinds, plus generic fields. */
const unknownKindString: fc.Arbitrary<string> = fc
  .oneof(fc.constantFrom('process-started', 'env-changed', 'bucket-deleted'), fc.string({ maxLength: 12 }))
  .filter((k) => !KNOWN_CHANGE_KINDS.includes(k));

/** Unknown-kind changes, and known kinds with a missing or mistyped required field. */
export const unknownChange: fc.Arbitrary<Change> = fc.oneof(
  fc
    .tuple(unknownKindString, genericValue(1))
    .map(([kind, fields]) => ({ ...fields, kind }) as Change),
  fc
    .tuple(
      fc.constantFrom('file-created', 'file-deleted', 'sql-row-count', 'symlink-changed'),
      fc.oneof(fc.constant(undefined), fc.integer(), fc.boolean(), fc.constant(null)),
      genericValue(1),
    )
    .map(([kind, bad, fields]) => {
      const out: Rec = { ...fields, kind };
      if (kind === 'sql-row-count') {
        out['table'] = bad;
        out['rowsBefore'] = 'many';
      } else if (bad !== undefined) {
        out['path'] = bad;
      }
      return out as Change;
    }),
);

/** Scene input for the mirror world (a generic record). */
export function sceneValue(): fc.Arbitrary<Record<string, unknown>> {
  return genericValue(6);
}

/** A record with a back reference (not JSON). */
export const circularValue: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(genericValue(2), genericValue(2), fc.boolean())
  .map(([root, child, selfLoop]) => {
    if (selfLoop) {
      root['self'] = root;
    } else {
      root['child'] = child;
      child['back'] = root;
    }
    return root;
  });

/** A record nested `min` to `max` levels deep (default 9 to 40); not JSON-sized. */
export function deepValue(min = 9, max = 40): fc.Arbitrary<Record<string, unknown>> {
  return fc.integer({ min, max }).map((levels) => {
    let node: Rec = { leaf: 'visible-0' };
    for (let i = 0; i < levels; i += 1) node = { level: `visible-${i}`, next: node };
    return node;
  });
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Valid instants in the exact `YYYY-MM-DDTHH:MM:SSZ` form. */
export const isoUtc: fc.Arbitrary<string> = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T23:59:59Z'), noInvalidDate: true })
  .map((d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z'));

const BAD_TIMES: readonly string[] = [
  '',
  'yesterday',
  '2026-13-01T00:00:00Z',
  '2026-02-30T00:00:00Z',
  '2026-00-10T00:00:00Z',
  '2026-01-01T24:00:00Z',
  '2026-01-01T00:60:00Z',
  '2026-01-01T00:00:61Z',
  '2026-01-01 00:00:00Z',
  '2026-01-01T00:00:00',
  '2026-01-01T00:00:00+09:00',
  '26-01-01T00:00:00Z',
  '2026/01/01T00:00:00Z',
  '0000-00-00T00:00:00Z',
];

/** Invalid forms and mutated valid strings. */
export const badTime: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...BAD_TIMES),
  fc.string({ maxLength: 24 }).filter((s) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s)),
  fc
    .tuple(isoUtc, fc.constantFrom('space', 'dropZ', 'month13', 'hour25', 'truncate'))
    .map(([t, how]) => {
      switch (how) {
        case 'space':
          return t.replace('T', ' ');
        case 'dropZ':
          return t.slice(0, -1);
        case 'month13':
          return `${t.slice(0, 5)}13${t.slice(7)}`;
        case 'hour25':
          return `${t.slice(0, 11)}25${t.slice(13)}`;
        default:
          return t.slice(0, 10);
      }
    }),
);

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

const pathArb: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-z][a-z0-9._-]{0,8}$/), { minLength: 1, maxLength: 4 })
  .map((parts) => `/work/${parts.join('/')}`);
const tableArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/);
const rowCount = fc.oneof(fc.nat({ max: 5000 }), fc.constantFrom(0, 1, 1206));

/** A well-formed change of one of the five known kinds. */
export const change: fc.Arbitrary<Change> = fc.oneof(
  pathArb.chain((path) =>
    fc.constantFrom('file-created', 'file-overwritten', 'file-deleted').map((kind) => ({ kind, path }) as Change),
  ),
  fc.tuple(pathArb, pathArb, pathArb).map(
    ([path, targetBefore, targetAfter]) =>
      ({ kind: 'symlink-changed', path, targetBefore, targetAfter }) as Change,
  ),
  fc
    .tuple(tableArb, rowCount, rowCount, fc.boolean())
    .map(([table, a, b, dropped]) =>
      dropped
        ? ({ kind: 'sql-row-count', table, rowsBefore: a, rowsAfter: 0, dropped: true } as Change)
        : ({ kind: 'sql-row-count', table, rowsBefore: a, rowsAfter: b } as Change),
    ),
);

/** Per-step change arrays: 0 to 5 steps of 0 to 6 changes. */
export const changes: fc.Arbitrary<Change[][]> = fc.array(fc.array(change, { maxLength: 6 }), {
  maxLength: 5,
});

// ---------------------------------------------------------------------------
// Verdicts and claims
// ---------------------------------------------------------------------------

const wardIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/);
const reasonArb = fc.stringMatching(/^[A-Za-z0-9 ,.:'-]{1,40}$/);
const KNOWN_NOTICE_KINDS = ['effect-outside', 'observed-event', 'content-inspection', 'path-escape'];
const EXTRA_NOTICE_KINDS = ['unsupported-step', 'future-kind'];

/** A notice; `kind` is not narrowed: it includes kinds beyond the known ones. */
const wardNotice: fc.Arbitrary<WardNotice> = fc
  .tuple(
    fc.oneof(
      fc.constantFrom(...KNOWN_NOTICE_KINDS),
      fc.constantFrom(...EXTRA_NOTICE_KINDS),
      fc.stringMatching(/^[a-z][a-z-]{0,14}$/),
    ),
    reasonArb,
    fc.nat({ max: 20 }),
    fc.option(fc.constantFrom('exfil.example', 'sink.invalid'), { nil: undefined }),
    fc.option(pathArb, { nil: undefined }),
  )
  .map(([kind, reason, stepIndex, destination, path]) => {
    const n: Rec = { kind, reason, stepIndex };
    if (destination !== undefined) n['destination'] = destination;
    if (path !== undefined) n['path'] = path;
    return n as unknown as WardNotice;
  });

/** A verdict with 0 to 12 violations and 0 to 12 notices (repeated ward ids included). */
export const wardVerdict: fc.Arbitrary<WardVerdict> = fc
  .tuple(
    fc.constantFrom<'pass' | 'warn' | 'block'>('pass', 'warn', 'block'),
    fc.array(
      fc.tuple(
        fc.oneof(wardIdArb, fc.constantFrom('no-delete', 'keep-users')),
        fc.constantFrom<'path' | 'sql' | 'egress' | 'physics'>('path', 'sql', 'egress', 'physics'),
        reasonArb,
      ),
      { maxLength: 12 },
    ),
    fc.array(wardNotice, { maxLength: 12 }),
  )
  .map(([verdict, violations, notices]) => ({
    verdict,
    violations: violations.map(([wardId, wardKind, reason]) => ({ wardId, wardKind, reason })),
    notices,
  }));

/** A well-formed isolation claims object. */
export const claims: fc.Arbitrary<IsolationClaims> = fc
  .tuple(
    fc.constantFrom<'docker-box' | 'static-analysis' | 'playground'>(
      'docker-box',
      'static-analysis',
      'playground',
    ),
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
    fc.constantFrom<'docker-unavailable' | 'box-image-missing'>('docker-unavailable', 'box-image-missing'),
  )
  .map(([mode, p1Claimed, p5Claimed, p6Claimed, reason]) =>
    mode === 'static-analysis'
      ? { mode, p1Claimed, p5Claimed, p6Claimed, reason }
      : { mode, p1Claimed, p5Claimed, p6Claimed },
  );

const nonBoolean: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom('true', 'yes', 1, 0, null),
  fc.constant(undefined),
  fc.string({ maxLength: 4 }),
);
const maybeFlag: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: fc.boolean() },
  { weight: 1, arbitrary: nonBoolean },
);
const looseReason: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom('docker-unavailable', 'box-image-missing', 'static-analysis', 'unsupported-step'),
  fc.string({ maxLength: 12 }),
  fc.constant(undefined),
);

/** A `notApplicable` value: valid lists, lists with P1 or junk entries, and non-arrays. */
const looseNotApplicable: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.subarray(['P5', 'P6'] as const) },
  { weight: 2, arbitrary: fc.array(fc.constantFrom<unknown>('P1', 'P5', 'P6', 'p5', 7, null, 'P7'), { maxLength: 4 }) },
  { weight: 1, arbitrary: fc.constantFrom<unknown>('P5', 5, null, {}) },
);

function claimRecord(
  mode: unknown,
  p1: unknown,
  p5: unknown,
  p6: unknown,
  reason: unknown,
  notApplicable?: unknown,
): unknown {
  const out: Rec = { mode, p1Claimed: p1, p5Claimed: p5, p6Claimed: p6 };
  if (reason !== undefined) out['reason'] = reason;
  if (notApplicable !== undefined) out['notApplicable'] = notApplicable;
  return out;
}

const guaranteedMode = fc.constantFrom('docker-box', 'playground');
/** A mode outside the three known values (static-analysis has its own branch, `claimsStatic`). */
const otherMode: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 8 }).filter((s) => s !== 'docker-box' && s !== 'playground' && s !== 'static-analysis'),
  fc.integer(),
);

/** Condition A true and condition B true: p1 claimed, and p5 or p6 not claimed. */
const claimsBoth: fc.Arbitrary<unknown> = fc
  .tuple(guaranteedMode, fc.constantFrom<[unknown, unknown]>([false, true], [true, false], [false, false], [null, true]))
  .map(([mode, [p5, p6]]) => claimRecord(mode, true, p5, p6, undefined));

/** Condition A true only: p1, p5, p6 all `true`. */
const claimsOnlyA: fc.Arbitrary<unknown> = guaranteedMode.map((mode) =>
  claimRecord(mode, true, true, true, undefined),
);

/** Condition B true only: A fails (wrong mode or p1 not claimed) and a banner is needed. */
const claimsOnlyB: fc.Arbitrary<unknown> = fc.oneof(
  fc.tuple(guaranteedMode, nonBoolean.filter((v) => v !== true), maybeFlag, maybeFlag).map(([m, p1, p5, p6]) =>
    claimRecord(m, p1, p5, p6, undefined),
  ),
  fc.tuple(guaranteedMode, fc.constant(false), maybeFlag, maybeFlag).map(([m, p1, p5, p6]) =>
    claimRecord(m, p1, p5, p6, undefined),
  ),
  fc.tuple(otherMode, maybeFlag, maybeFlag, maybeFlag, looseReason).map(([m, p1, p5, p6, r]) =>
    claimRecord(m, p1, p5, p6, r),
  ),
);

/** Plan B: mode static-analysis with arbitrary flags, reason, and notApplicable list. */
const claimsStatic: fc.Arbitrary<unknown> = fc
  .tuple(maybeFlag, maybeFlag, maybeFlag, looseReason, fc.option(looseNotApplicable, { nil: undefined }))
  .map(([p1, p5, p6, r, na]) => claimRecord('static-analysis', p1, p5, p6, r, na));

/** Fully random records and non-record values. */
const claimsLoose: fc.Arbitrary<unknown> = fc
  .tuple(
    fc.oneof(guaranteedMode, otherMode),
    maybeFlag,
    maybeFlag,
    maybeFlag,
    looseReason,
    fc.option(looseNotApplicable, { nil: undefined }),
  )
  .map(([m, p1, p5, p6, r, na]) => claimRecord(m, p1, p5, p6, r, na));

/** Sealed mode, boolean flags, a `notApplicable` list, and any reason: exercises the not-applicable rule. */
const claimsNa: fc.Arbitrary<unknown> = fc
  .tuple(guaranteedMode, fc.boolean(), fc.boolean(), fc.boolean(), looseReason, looseNotApplicable)
  .map(([m, p1, p5, p6, r, na]) => claimRecord(m, p1, p5, p6, r, na));

/**
 * Anything a caller might pass as `claims`. Weighted so that each of "A and B", "only A", and
 * "only B" has probability of at least 1 in 10 (A: Assurance_Text; B: banner), and each of the modes
 * docker-box, playground, and static-analysis has a share of at least 20 %.
 */
export const claimsAny: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.oneof(fc.constant(null), fc.string({ maxLength: 6 }), fc.integer(), fc.array(fc.integer(), { maxLength: 2 })) },
  { weight: 3, arbitrary: claimsBoth },
  { weight: 2, arbitrary: claimsOnlyA },
  { weight: 3, arbitrary: claimsOnlyB },
  { weight: 1, arbitrary: claimsLoose },
  { weight: 3, arbitrary: claimsNa },
  { weight: 6, arbitrary: claimsStatic },
);

export type ClaimsBucket = 'both' | 'onlyA' | 'onlyB' | 'neither';

/** Independent classification of a `claims` input into the A and B conditions. */
export function claimsBucket(value: unknown): ClaimsBucket {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'onlyB';
  const r = value as Rec;
  const a = (r['mode'] === 'docker-box' || r['mode'] === 'playground') && r['p1Claimed'] === true;
  const na = Array.isArray(r['notApplicable']) ? (r['notApplicable'] as unknown[]) : [];
  const malformed =
    !(r['mode'] === 'docker-box' || r['mode'] === 'playground' || r['mode'] === 'static-analysis') ||
    ['p1Claimed', 'p5Claimed', 'p6Claimed'].some((k) => typeof r[k] !== 'boolean');
  const b =
    (malformed && r['mode'] !== 'static-analysis') ||
    r['p1Claimed'] !== true ||
    (r['p5Claimed'] !== true && !na.includes('P5')) ||
    (r['p6Claimed'] !== true && !na.includes('P6'));
  const staticBanner = r['mode'] === 'static-analysis';
  const banner = b || staticBanner;
  if (a && banner) return 'both';
  if (a) return 'onlyA';
  return banner ? 'onlyB' : 'neither';
}

// ---------------------------------------------------------------------------
// Findings, scans, and sources
// ---------------------------------------------------------------------------

const LF = 0x0a;
const CR = 0x0d;

type FindingCategory = Finding['category'];

const ZERO_WIDTH = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
const NAMES: Readonly<Record<number, string>> = {
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x2060: 'WORD JOINER',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
};

function hex(n: number): string {
  return `U+${n.toString(16).toUpperCase().padStart(4, '0')}`;
}

function renderRun(category: FindingCategory, codePoints: readonly number[], inner: string): string {
  if (category === 'html-comment') return inner;
  return codePoints
    .map((c) => {
      if (category === 'tag') {
        return c >= 0xe0020 && c <= 0xe007e ? String.fromCharCode(c - 0xe0000) : `<${hex(c)}>`;
      }
      return `<${hex(c)} ${NAMES[c] ?? 'UNKNOWN'}>`;
    })
    .join('');
}

/** 1-based line and column of the code point at `offset` (same rules as the scanner). */
export function positionOf(codePoints: readonly number[], offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  const limit = Math.min(offset, codePoints.length);
  for (let i = 0; i < limit; i += 1) {
    const c = codePoints[i];
    if (c === LF || (c === CR && codePoints[i + 1] !== LF)) {
      line += 1;
      lineStart = i + 1;
    }
  }
  // Offsets past the end are placed as if the text continued without line breaks.
  return { line, column: offset - lineStart + 1 };
}

const runCodePoints = (category: Exclude<FindingCategory, 'html-comment'>): fc.Arbitrary<number[]> => {
  const one =
    category === 'tag'
      ? fc.integer({ min: 0xe0000, max: 0xe007f })
      : category === 'zero-width'
        ? fc.constantFrom(...ZERO_WIDTH)
        : fc.oneof(fc.integer({ min: 0x202a, max: 0x202e }), fc.integer({ min: 0x2066, max: 0x2069 }));
  return fc.array(one, { minLength: 1, maxLength: 6 });
};

const commentInner: fc.Arbitrary<string> = fc.stringMatching(/^[A-Za-z0-9 ]{0,16}$/);

/** The code points, first code point, and rendering of a Finding of the given category. */
function content(category: FindingCategory): fc.Arbitrary<{ codePoints: number[]; rendering: string }> {
  if (category === 'html-comment') {
    return commentInner.map((inner) => ({
      codePoints: [...Array.from(COMMENT_OPEN + inner + '--' + cp(0x3e), (c) => c.codePointAt(0) as number)],
      rendering: inner,
    }));
  }
  return runCodePoints(category).map((codePoints) => ({
    codePoints,
    rendering: renderRun(category, codePoints, ''),
  }));
}

const category: fc.Arbitrary<FindingCategory> = fc.constantFrom('tag', 'zero-width', 'bidi', 'html-comment');

function buildFinding(
  cat: FindingCategory,
  body: { codePoints: number[]; rendering: string },
  textCps: readonly number[],
  offset: number,
): Finding {
  const { line, column } = positionOf(textCps, offset);
  return {
    category: cat,
    line,
    column,
    offset,
    length: body.codePoints.length,
    codePoints: body.codePoints,
    firstCodePoint: hex(body.codePoints[0] as number),
    rendering: body.rendering,
  };
}

/** A Finding positioned inside `text` (line, column, and offset agree); findings may overlap others. */
export function findingFor(text: string): fc.Arbitrary<Finding> {
  const cps = Array.from(text, (c) => c.codePointAt(0) as number);
  const max = Math.max(cps.length - 1, 0);
  return fc
    .tuple(category.chain((c) => content(c).map((b) => [c, b] as const)), fc.integer({ min: 0, max }))
    .map(([[cat, body], offset]) => buildFinding(cat, body, cps, offset));
}

/** A Finding whose offset lies beyond the end of `text`. */
export function findingOutside(text: string): fc.Arbitrary<Finding> {
  const cps = Array.from(text, (c) => c.codePointAt(0) as number);
  return fc
    .tuple(category.chain((c) => content(c).map((b) => [c, b] as const)), fc.integer({ min: 1, max: 50 }))
    .map(([[cat, body], extra]) => buildFinding(cat, body, cps, cps.length + extra));
}

const textLine: fc.Arbitrary<string> = fc.stringMatching(/^[a-z ]{0,20}$/);

/** A text of `min` to `max` lines (LF, with the occasional CRLF or lone CR). */
export function lines(min = 1, max = 6): fc.Arbitrary<string> {
  return fc
    .array(fc.tuple(textLine, fc.constantFrom('\n', '\n', '\n', '\r\n', '\r')), { minLength: min, maxLength: max })
    .map((parts) => parts.map(([l, sep], i) => (i === parts.length - 1 ? l : l + sep)).join(''));
}

/** A text of 201 to 400 lines. */
export const longText: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-z]{0,8}$/), { minLength: 201, maxLength: 400 })
  .map((ls) => ls.join('\n'));

/** A standalone Finding (positions are consistent with a small generated text). */
export const finding: fc.Arbitrary<Finding> = lines(1, 4).chain((text) =>
  text.length === 0 ? findingOutside(text) : findingFor(text),
);

/** Hand-built Findings for `text`: 0 to 8, or 101 to 250 when `many`; some may lie outside the text. */
export function findingsFor(text: string, many = false): fc.Arbitrary<Finding[]> {
  const inside = text.length === 0 ? findingOutside(text) : findingFor(text);
  const item = fc.oneof({ weight: 9, arbitrary: inside }, { weight: 1, arbitrary: findingOutside(text) });
  return fc.array(item, many ? { minLength: 101, maxLength: 250 } : { minLength: 0, maxLength: 8 });
}

/** A scan result for `text`: the scanner itself, hand-built Findings, or 101 to 250 Findings. */
export function scanResultFor(text: string): fc.Arbitrary<ScanResult> {
  return fc.oneof(
    { weight: 2, arbitrary: fc.constant(scanText(text)) },
    { weight: 2, arbitrary: findingsFor(text).map((findings) => ({ findings })) },
    { weight: 1, arbitrary: findingsFor(text, true).map((findings) => ({ findings })) },
  );
}

/** `scanText` from core as a test-only oracle. */
export function scanOracle(text: string): ScanResult {
  return scanText(text);
}

/** A scan result over a small generated text. */
export const scanResult: fc.Arbitrary<ScanResult> = lines(1, 4).chain(scanResultFor);

const sourceName = fc.stringMatching(/^[a-z][a-z0-9/._-]{0,16}$/);

/** A blacklight source (source name, text, scan result). */
export const blacklightSource: fc.Arbitrary<BlacklightSource> = fc
  .tuple(sourceName, lines(1, 6))
  .chain(([source, text]) => scanResultFor(text).map((scan) => ({ source, text, scan })));

/**
 * A text of 0 to 400 lines with 0 to 250 hidden runs inserted, plus its `scanText` result.
 * Used with the reveal sets of the Blacklight model.
 */
export const bigScan: fc.Arbitrary<{ text: string; scan: ScanResult }> = fc
  .tuple(
    fc.array(fc.stringMatching(/^[a-z]{0,10}$/), { minLength: 0, maxLength: 400 }),
    fc.array(
      fc.tuple(fc.nat(), fc.nat(), fc.array(scannedHiddenCodePoint, { minLength: 1, maxLength: 4 })),
      { minLength: 0, maxLength: 250 },
    ),
  )
  .map(([baseLines, runs]) => {
    const ls: string[][] = (baseLines.length === 0 ? [''] : baseLines).map((l) => Array.from(l));
    for (const [lineAt, colAt, run] of runs) {
      const l = ls[lineAt % ls.length] as string[];
      const pos = colAt % (l.length + 1);
      l.splice(pos, 0, run.join(''));
    }
    const text = baseLines.length === 0 && runs.length === 0 ? '' : ls.map((l) => l.join('')).join('\n');
    return { text, scan: scanText(text) };
  });

// ---------------------------------------------------------------------------
// Red thread, grave entries
// ---------------------------------------------------------------------------

/** A needle (value is non-empty; hosts are reserved). */
export const needle: fc.Arbitrary<Needle> = fc.record({
  value: fc.oneof(fc.constantFrom('exfil.example', 'sink.invalid', 'collector.invalid'), pathArb),
  origin: fc.constantFrom<Needle['origin']>('effect', 'observed-destination', 'observed-path'),
  stepIndex: fc.nat({ max: 20 }),
});

const printableAscii = fc.stringMatching(/^[ -~]{0,60}$/);

/** A thread link: `found` or `not-found`, hidden true or false, matchedKey value or host. */
export const threadLink: fc.Arbitrary<ThreadLink> = fc.oneof(
  needle.map((n) => ({ status: 'not-found', needle: n }) as ThreadLink),
  fc
    .tuple(
      needle,
      fc.constantFrom<'value' | 'host'>('value', 'host'),
      sourceName,
      fc.constantFrom<'file' | 'issue' | 'web' | 'other'>('file', 'issue', 'web', 'other'),
      fc.nat({ max: 10 }),
      fc.integer({ min: 1, max: 400 }),
      fc.integer({ min: 1, max: 200 }),
      printableAscii,
      fc.boolean(),
    )
    .map(
      ([n, matchedKey, source, kind, recordIndex, line, column, lineText, hidden]) =>
        ({ status: 'found', needle: n, matchedKey, source, kind, recordIndex, line, column, lineText, hidden }) as ThreadLink,
    ),
);

/** Optional parts of a grave entry; every part may be absent. */
export const graveDetail: fc.Arbitrary<GraveDetail> = fc.record(
  {
    wardVerdict,
    changes,
    claims,
    sources: fc.array(blacklightSource, { maxLength: 2 }),
    needles: fc.array(needle, { maxLength: 3 }),
    links: fc.array(threadLink, { maxLength: 3 }),
    actionLabels: fc.array(fc.stringMatching(/^[a-z ]{1,16}$/), { maxLength: 3 }),
  },
  { requiredKeys: [] },
) as fc.Arbitrary<GraveDetail>;

/** A grave entry with a link-safe id, a valid instant, and optional detail. */
export const graveEntry: fc.Arbitrary<GraveEntry> = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/),
    fc.stringMatching(/^[a-z]{2,8} [ -~]{0,40}$/),
    isoUtc,
    fc.array(wardIdArb, { maxLength: 4 }),
    fc.option(graveDetail, { nil: undefined }),
  )
  .map(([id, command, recordedAt, wardIds, detail]) =>
    detail === undefined ? { id, command, recordedAt, wardIds } : { id, command, recordedAt, wardIds, detail },
  );

// ---------------------------------------------------------------------------
// Breaking valid data
// ---------------------------------------------------------------------------

/** Replace one field (or array element) of a valid value by an arbitrary JSON value. */
export function breakOne<T>(valid: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc.tuple(valid, fc.jsonValue(), fc.nat()).map(([v, replacement, pick]) => {
    if (typeof v !== 'object' || v === null) return replacement;
    if (Array.isArray(v)) {
      if (v.length === 0) return replacement;
      const copy: unknown[] = [...(v as unknown[])];
      copy[pick % copy.length] = replacement;
      return copy;
    }
    const keys = Object.keys(v);
    if (keys.length === 0) return replacement;
    const copy: Rec = { ...(v as Rec) };
    copy[keys[pick % keys.length] as string] = replacement;
    return copy;
  });
}
