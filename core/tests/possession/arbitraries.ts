// Shared fast-check arbitraries, reference oracles, and the ASCII failure reporter
// for the possession property tests (Feature: possession, design "Arbitraries" and
// "Test oracles").
//
// Every hidden character, emoji, flag, and comment opener is built from numbers
// (String.fromCodePoint / String.fromCharCode). No literal hidden character appears here.
// No Node API is used (this file is type-checked with `types: []`).
//
// The oracles are written separately from the implementation. They share only the
// generated tables, which are validated by their own tests.

import * as fc from 'fast-check';
import { escapeAscii } from '../../src/possession/classify.js';
import { EXTENDED_PICTOGRAPHIC_RANGES } from '../../src/possession/emoji-table.generated.js';
import { RGI_TAG_SEQUENCES } from '../../src/possession/tag-sequence-table.generated.js';
import type { Effect, ObservedEvent } from '../../src/types.js';
import type {
  NeedleSource,
  ProvenanceKind,
  ProvenanceRecord,
  ScanInput,
} from '../../src/possession/types.js';
import { NUM_RUNS } from '../pbt-config.js';

// -- Small helpers ------------------------------------------------------------

const cpString = (cps: readonly number[]): string => String.fromCodePoint(...cps);

/** Code points of a string; a lone surrogate is one element. */
export function toCodePoints(text: string): number[] {
  return Array.from(text, (ch) => ch.codePointAt(0) as number);
}

/** The HTML comment opener and closer, built from numbers. */
export const OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d);
export const CLOSER = String.fromCodePoint(0x2d, 0x2d, 0x3e);

export const ZWJ = 0x200d;
export const BASE_FLAG = 0x1f3f4;
export const CANCEL_TAG = 0xe007f;

const hex4 = (c: number): string => 'U+' + c.toString(16).toUpperCase().padStart(4, '0');

// -- ASCII failure reporter ---------------------------------------------------

/**
 * fast-check reporter: on failure, throws the default report (seed, counterexample)
 * with every character outside printable ASCII and LF spelled as <U+XXXX>.
 */
export function asciiReporter<T>(details: fc.RunDetails<T>): void {
  if (!details.failed) return;
  const message = fc.defaultReportMessage(details) ?? 'property failed';
  throw new Error(message.split('\n').map(escapeAscii).join('\n'));
}

/** Parameters for fc.assert: NUM_RUNS runs and the ASCII reporter. */
export const PBT_PARAMS: fc.Parameters<unknown> = { numRuns: NUM_RUNS, reporter: asciiReporter };

// -- Basic code point arbitraries --------------------------------------------

export const hangul: fc.Arbitrary<string> = fc
  .oneof(fc.integer({ min: 0xac00, max: 0xd7a3 }), fc.integer({ min: 0x1100, max: 0x11ff }))
  .map((c) => String.fromCodePoint(c));

/** Extended_Pictographic code points; U+1F3F4 is not in this list. */
export const emojiBase: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0x1f600, max: 0x1f64f }),
  fc.constantFrom(0x2764, 0x1f468, 0x1f469, 0x1f466, 0x1f525, 0x1f9d1),
);

export const emojiUnit: fc.Arbitrary<number[]> = fc
  .tuple(emojiBase, fc.boolean(), fc.option(fc.integer({ min: 0x1f3fb, max: 0x1f3ff }), { nil: undefined }))
  .map(([base, vs, tone]) => {
    const out = [base];
    if (vs) out.push(0xfe0f);
    if (tone !== undefined) out.push(tone);
    return out;
  });

export const zwjSequence: fc.Arbitrary<string> = fc
  .array(emojiUnit, { minLength: 2, maxLength: 4 })
  .map((units) => cpString(units.flatMap((u, i) => (i === 0 ? u : [ZWJ, ...u]))));

/** Code point lists of the listed sequences (England, Scotland, Wales in 16.0). */
export const flagSequenceCodePoints: fc.Arbitrary<readonly number[]> = fc.constantFrom(
  ...RGI_TAG_SEQUENCES,
);

export const flagSequence: fc.Arbitrary<string> = flagSequenceCodePoints.map(cpString);

/** 1 to 12 Tag_Characters (U+E0000..U+E007F, includes U+E007F), plus an ASCII-decodable variant. */
export const appendedTags: fc.Arbitrary<number[]> = fc.oneof(
  { weight: 3, arbitrary: fc.array(fc.integer({ min: 0xe0000, max: 0xe007f }), { minLength: 1, maxLength: 12 }) },
  { weight: 2, arbitrary: fc.array(fc.integer({ min: 0xe0020, max: 0xe007e }), { minLength: 1, maxLength: 12 }) },
);

export const regionalIndicator: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0x1f1e6, max: 0x1f1ff }), fc.integer({ min: 0x1f1e6, max: 0x1f1ff }))
  .map(([a, b]) => String.fromCodePoint(a, b));

/** U+0300..U+036F, includes U+034F. */
export const combining: fc.Arbitrary<string> = fc
  .integer({ min: 0x300, max: 0x36f })
  .map((c) => String.fromCodePoint(c));

/** U+00AD, U+034F, U+FE00 to U+FE0E, U+200E, U+200F. */
export const neutralInvisible: fc.Arbitrary<string> = fc
  .oneof(
    fc.constantFrom(0xad, 0x34f, 0x200e, 0x200f),
    fc.integer({ min: 0xfe00, max: 0xfe0e }),
  )
  .map((c) => String.fromCodePoint(c));

export const asciiPrintable: fc.Arbitrary<string> = fc
  .integer({ min: 0x20, max: 0x7e })
  .map((c) => String.fromCharCode(c));

/** LF, CRLF, lone CR. */
export const lineBreak: fc.Arbitrary<string> = fc.constantFrom(
  String.fromCharCode(0x0a),
  String.fromCharCode(0x0d, 0x0a),
  String.fromCharCode(0x0d),
);

/** Tag, zero-width, and bidi code points as numbers. */
export const hiddenCodePoint: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0xe0000, max: 0xe007f }),
  fc.constantFrom(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff),
  fc.integer({ min: 0x202a, max: 0x202e }),
  fc.integer({ min: 0x2066, max: 0x2069 }),
);

/** Hidden code point category by number (test-side table, separate from the module). */
export function refCategory(c: number): 'tag' | 'zero-width' | 'bidi' | 'none' {
  if (c >= 0xe0000 && c <= 0xe007f) return 'tag';
  if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0x2060 || c === 0xfeff) return 'zero-width';
  if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return 'bidi';
  return 'none';
}

/** A single unpaired surrogate as a one-code-unit string. */
export const loneSurrogate: fc.Arbitrary<string> = fc
  .integer({ min: 0xd800, max: 0xdfff })
  .map((c) => String.fromCharCode(c));

// -- Tag run cases (Property 20) ---------------------------------------------

export type TagCaseKind = 'a' | 'b' | 'c' | 'd' | 'e';

export interface TagRunCase {
  readonly kind: TagCaseKind;
  readonly codePoints: readonly number[];
  readonly text: string;
  /** Expected class, carried as data and not computed by the scanner. */
  readonly expected: 'flagged' | 'permitted';
}

const isListed = (cps: readonly number[]): boolean =>
  RGI_TAG_SEQUENCES.some((e) => e.length === cps.length && e.every((v, i) => v === cps[i]));

const makeCase = (kind: TagCaseKind, cps: readonly number[], expected: 'flagged' | 'permitted'): TagRunCase => ({
  kind,
  codePoints: cps,
  text: cpString(cps),
  expected,
});

const tagCaseA: fc.Arbitrary<TagRunCase> = fc
  .array(fc.integer({ min: 0xe0000, max: 0xe007f }), { minLength: 1, maxLength: 8 })
  .map((cps) => makeCase('a', cps, 'flagged'));

const tagCaseB: fc.Arbitrary<TagRunCase> = fc
  .tuple(flagSequenceCodePoints, fc.nat())
  .map(([entry, n]) => {
    const tagCount = entry.length - 2;
    const k = 1 + (n % tagCount);
    return makeCase('b', [BASE_FLAG, ...entry.slice(1, 1 + k)], 'flagged');
  });

const tagCaseC: fc.Arbitrary<TagRunCase> = fc
  .array(fc.integer({ min: 0xe0061, max: 0xe007a }), { minLength: 1, maxLength: 8 })
  .map((letters) => [BASE_FLAG, ...letters, CANCEL_TAG])
  .filter((cps) => !isListed(cps))
  .map((cps) => makeCase('c', cps, 'flagged'));

const tagCaseD: fc.Arbitrary<TagRunCase> = fc
  .tuple(
    flagSequenceCodePoints,
    fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0xe0020, max: 0xe007e })), { minLength: 1, maxLength: 3 }),
  )
  .map(([entry, extras]) => {
    const tags = entry.slice(1, entry.length - 1).slice();
    for (const [pos, extra] of extras) tags.splice(pos % (tags.length + 1), 0, extra);
    return makeCase('d', [BASE_FLAG, ...tags, CANCEL_TAG], 'flagged');
  });

const tagCaseE: fc.Arbitrary<TagRunCase> = flagSequenceCodePoints.map((e) => makeCase('e', e, 'permitted'));

export const tagRunCase: fc.Arbitrary<TagRunCase> = fc.oneof(tagCaseA, tagCaseB, tagCaseC, tagCaseD, tagCaseE);

// -- Ordinary text ------------------------------------------------------------

const noOpener = (s: string): boolean => !s.includes(OPENER);

const ordinaryPiece: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: asciiPrintable },
  { weight: 2, arbitrary: hangul },
  { weight: 2, arbitrary: emojiUnit.map(cpString) },
  { weight: 2, arbitrary: zwjSequence },
  { weight: 2, arbitrary: flagSequence },
  { weight: 1, arbitrary: regionalIndicator },
  { weight: 1, arbitrary: combining },
  { weight: 1, arbitrary: neutralInvisible },
  { weight: 2, arbitrary: lineBreak },
);

const noEmojiPiece: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: asciiPrintable },
  { weight: 2, arbitrary: hangul },
  { weight: 1, arbitrary: combining },
  { weight: 1, arbitrary: neutralInvisible },
  { weight: 2, arbitrary: lineBreak },
);

/** Hangul, emoji, ZWJ sequences, flags, combining marks, ASCII, Line_Breaks. No opener. */
export const ordinaryText: fc.Arbitrary<string> = fc
  .array(ordinaryPiece, { maxLength: 24 })
  .map((p) => p.join(''))
  .filter(noOpener);

/** Ordinary text without emoji, flags (no U+1F3F4), regional indicators, or ZWJ sequences. */
export const ordinaryNoEmoji: fc.Arbitrary<string> = fc
  .array(noEmojiPiece, { maxLength: 24 })
  .map((p) => p.join(''))
  .filter(noOpener);

// -- Any text -----------------------------------------------------------------

/** Pieces that sit on tag-sequence boundaries. */
const boundaryPiece: fc.Arbitrary<string> = fc.oneof(
  // a flag followed by one appended tag
  fc.tuple(flagSequence, fc.integer({ min: 0xe0000, max: 0xe007f })).map(([f, t]) => f + String.fromCodePoint(t)),
  // a flag followed by an appended cancel tag
  flagSequence.map((f) => f + String.fromCodePoint(CANCEL_TAG)),
  // two flags in a row
  fc.tuple(flagSequence, flagSequence).map(([a, b]) => a + b),
  // one code point short of a listed sequence (the cancel tag is missing)
  flagSequenceCodePoints.map((e) => cpString(e.slice(0, e.length - 1))),
);

const basePiece: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: ordinaryPiece },
  { weight: 3, arbitrary: hiddenCodePoint.map((c) => String.fromCodePoint(c)) },
  { weight: 2, arbitrary: flagSequence },
  { weight: 2, arbitrary: fc.tuple(flagSequence, appendedTags).map(([f, t]) => f + cpString(t)) },
  { weight: 2, arbitrary: tagRunCase.map((c) => c.text) },
  { weight: 2, arbitrary: boundaryPiece },
  { weight: 1, arbitrary: loneSurrogate },
  { weight: 1, arbitrary: fc.constant('<') },
  { weight: 1, arbitrary: fc.constant('!-') },
);

/** Opener code points, a body of pieces (may nest an opener or hidden code points), optional closer. */
export const commentSegment: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(fc.oneof({ weight: 4, arbitrary: basePiece }, { weight: 1, arbitrary: fc.constant(OPENER) }), {
      maxLength: 8,
    }),
    fc.boolean(),
  )
  .map(([body, closed]) => OPENER + body.join('') + (closed ? CLOSER : ''));

/** Union of every piece kind above. Used where the full input space is wanted. */
export const anyText: fc.Arbitrary<string> = fc
  .array(fc.oneof({ weight: 8, arbitrary: basePiece }, { weight: 1, arbitrary: commentSegment }), {
    maxLength: 20,
  })
  .map((p) => p.join(''));

/** anyText without CR and LF characters, so that one value is exactly one line. */
export const lineText: fc.Arbitrary<string> = anyText.map((s) => s.replace(/[\r\n]/g, ''));

// -- Removal-creates-comment pieces (Property 9) -------------------------------

/** Zero-width, bidi, or lone Tag_Character hidden code points that the first sanitize round removes. */
const removableHidden: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      fc.constantFrom(0x200b, 0x200c, 0x2060, 0xfeff),
      fc.integer({ min: 0x202a, max: 0x202e }),
      fc.integer({ min: 0x2066, max: 0x2069 }),
      fc.integer({ min: 0xe0020, max: 0xe007e }),
    ),
    { minLength: 1, maxLength: 3 },
  )
  .map(cpString);

/**
 * Inputs whose one-pass sanitize result contains a new HTML comment opener, so that a second
 * round is needed: hidden characters inside the opener, or a comment between `<` and `!--`.
 * With markdown on, removing the hidden characters (or the inner comment) creates a Finding.
 */
export const openerCreatedByRemoval: fc.Arbitrary<string> = fc.oneof(
  // hidden characters inside the opener, optionally with a body and a closer
  fc
    .tuple(
      fc.integer({ min: 1, max: 3 }),
      removableHidden,
      fc.constantFrom('', 'x', ' note '),
      fc.boolean(),
    )
    .map(([cut, hidden, body, closed]) => {
      const op = Array.from(OPENER);
      return op.slice(0, cut).join('') + hidden + op.slice(cut).join('') + body + (closed ? CLOSER : '');
    }),
  // a complete comment between '<' and '!--'
  fc
    .tuple(fc.constantFrom('', 'x', ' note '), removableHidden)
    .map(([body, hidden]) => '<' + hidden + OPENER + body + CLOSER + '!--'),
);

// -- Insertion helpers --------------------------------------------------------

/**
 * Biased insertion index in code points (0..length): index 0, last index, right
 * after a Line_Break, and uniform.
 */
export function insertionPoint(text: string): fc.Arbitrary<number> {
  const cps = toCodePoints(text);
  const afterBreaks: number[] = [];
  cps.forEach((c, i) => {
    if (c === 0x0a || c === 0x0d) afterBreaks.push(i + 1);
  });
  const arbs: { weight: number; arbitrary: fc.Arbitrary<number> }[] = [
    { weight: 2, arbitrary: fc.constant(0) },
    { weight: 2, arbitrary: fc.constant(cps.length) },
    { weight: 3, arbitrary: fc.integer({ min: 0, max: cps.length }) },
  ];
  if (afterBreaks.length > 0) arbs.push({ weight: 2, arbitrary: fc.constantFrom(...afterBreaks) });
  return fc.oneof(...arbs);
}

/** Insert `inserted` before code point index `index`. */
export function insertAt(text: string, index: number, inserted: string): string {
  const cps = Array.from(text);
  return cps.slice(0, index).join('') + inserted + cps.slice(index).join('');
}

// -- ZWJ contexts (Property 4) ------------------------------------------------

export type ZwjToken = 'emoji' | 'modifier' | 'non-emoji' | 'flag' | 'hidden';

export interface ZwjContext {
  readonly before: readonly ZwjToken[];
  readonly after: readonly ZwjToken[];
  readonly text: string;
  /** Code point index of the U+200D under test. */
  readonly zwjIndex: number;
}

const zwjTokenText: Record<ZwjToken, fc.Arbitrary<string>> = {
  emoji: emojiBase.map((c) => String.fromCodePoint(c)),
  modifier: fc
    .oneof(fc.constant(0xfe0f), fc.integer({ min: 0x1f3fb, max: 0x1f3ff }))
    .map((c) => String.fromCodePoint(c)),
  'non-emoji': fc.oneof(asciiPrintable, hangul, combining),
  flag: flagSequence,
  hidden: fc.oneof(
    fc.constantFrom(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff),
    fc.integer({ min: 0x202a, max: 0x202e }),
  ).map((c) => String.fromCodePoint(c)),
};

const zwjTokenKind: fc.Arbitrary<ZwjToken> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<ZwjToken>('emoji') },
  { weight: 3, arbitrary: fc.constant<ZwjToken>('modifier') },
  { weight: 2, arbitrary: fc.constant<ZwjToken>('non-emoji') },
  { weight: 1, arbitrary: fc.constant<ZwjToken>('flag') },
  { weight: 1, arbitrary: fc.constant<ZwjToken>('hidden') },
);

function zwjSide(): fc.Arbitrary<{ tokens: ZwjToken[]; texts: string[] }> {
  return fc.array(zwjTokenKind, { maxLength: 4 }).chain((tokens) =>
    fc.tuple(...tokens.map((t) => zwjTokenText[t])).map((texts) => ({ tokens, texts })),
  );
}

/** Tokens before and after one U+200D; either side may be empty (text boundary). */
export const zwjContext: fc.Arbitrary<ZwjContext> = fc.tuple(zwjSide(), zwjSide()).map(([b, a]) => ({
  before: b.tokens,
  after: a.tokens,
  text: b.texts.join('') + String.fromCodePoint(ZWJ) + a.texts.join(''),
  zwjIndex: toCodePoints(b.texts.join('')).length,
}));

// -- Provenance and red thread ------------------------------------------------

const provenanceKind: fc.Arbitrary<ProvenanceKind> = fc.constantFrom('file', 'issue', 'web', 'other');

const sourceArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    'https://docs.example/readme',
    'https://evil.test/page',
    'https://tracker.invalid/issue/1',
    'http://localhost/notes',
  ),
  fc.stringMatching(/^[a-z]{1,8}(\/[a-z]{1,8}){0,2}\.(md|txt)$/),
);

const lineSeparator: fc.Arbitrary<string> = fc.constantFrom(
  String.fromCharCode(0x0a),
  String.fromCharCode(0x0d, 0x0a),
  String.fromCharCode(0x0d),
);

const recordArb: fc.Arbitrary<ProvenanceRecord> = fc
  .tuple(sourceArb, provenanceKind, fc.array(lineText, { maxLength: 5 }), lineSeparator)
  .map(([source, kind, lines, sep]) => ({ source, kind, content: lines.join(sep) }));

/** 0 to 6 records. */
export const provenanceLog: fc.Arbitrary<ProvenanceRecord[]> = fc.array(recordArb, { maxLength: 6 });

/** Needle values: paths, reserved-domain URLs, a canary token. All printable ASCII. */
export const needleValue: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('/home/user/.env', 'sk-CANARY-abc123', '/srv/app/secrets/token.txt'),
  fc
    .tuple(
      fc.constantFrom('https', 'http'),
      fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
      fc.constantFrom('example', 'test', 'invalid', 'localhost'),
      fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
      fc.option(fc.stringMatching(/^[a-z]{1,6}(\/[a-z]{1,6})?$/), { nil: undefined }),
    )
    .map(
      ([scheme, label, tld, port, rest]) =>
        `${scheme}://${label}.${tld}${port === undefined ? '' : ':' + port}${rest === undefined ? '' : '/' + rest}`,
    ),
);

export interface PlantedLog {
  readonly log: ProvenanceRecord[];
  readonly needle: string;
  /** Record in which the needle was planted. */
  readonly recordIndex: number;
  /** 0-based line within that record. */
  readonly lineIndex: number;
  /** True when the needle is encoded in Tag_Characters. */
  readonly hidden: boolean;
}

/** Encode printable ASCII as Tag_Characters (code point + 0xE0000). */
export function tagEncode(ascii: string): string {
  return cpString(Array.from(ascii, (ch) => (ch.codePointAt(0) as number) + 0xe0000));
}

/** A log of at least one record with a needle placed at the start of a chosen line. */
export const plantedLog: fc.Arbitrary<PlantedLog> = fc
  .tuple(
    fc.array(recordArb, { minLength: 1, maxLength: 6 }),
    needleValue,
    fc.boolean(),
    fc.nat(),
    fc.nat(),
    lineSeparator,
  )
  .map(([records, needle, hidden, recPick, linePick, sep]) => {
    const recordIndex = recPick % records.length;
    const rec = records[recordIndex] as ProvenanceRecord;
    const lines = rec.content === '' ? [''] : rec.content.split(/\r\n|\r|\n/);
    const lineIndex = linePick % lines.length;
    lines[lineIndex] = (hidden ? tagEncode(needle) : needle) + (lines[lineIndex] as string);
    const log = records.map((r, i) => (i === recordIndex ? { ...r, content: lines.join(sep) } : r));
    return { log, needle, recordIndex, lineIndex, hidden };
  });

const stepIndexArb = fc.integer({ min: 0, max: 5 });

const effectArb: fc.Arbitrary<Effect> = fc
  .tuple(fc.constantFrom('network', 'db-write'), fc.oneof(fc.constant(''), needleValue))
  .map(([kind, destination]) => ({ kind, destination }));

const observedEventArb: fc.Arbitrary<ObservedEvent> = fc.record(
  {
    kind: fc.constantFrom('network-attempt', 'secret-read') as fc.Arbitrary<ObservedEvent['kind']>,
    destination: fc.oneof(fc.constant(''), needleValue),
    path: fc.oneof(fc.constant(''), needleValue),
    stepIndex: stepIndexArb,
  },
  { requiredKeys: ['kind', 'stepIndex'] },
);

/** `{ effectsOutside, observedEvents }` with empty or defined values. */
export const ghostReportPart: fc.Arbitrary<NeedleSource> = fc.record({
  effectsOutside: fc.array(fc.array(effectArb, { maxLength: 3 }), { maxLength: 4 }),
  observedEvents: fc.array(observedEventArb, { maxLength: 5 }),
});

// -- Scan entry inputs --------------------------------------------------------

const extensionArb: fc.Arbitrary<string> = fc.constantFrom(
  '.md', '.MD', '.Md', '.markdown', '.MARKDOWN', '.mdx', '.MdX', '.txt', '.ts', '.json', '.mdown', '',
);

const pathArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('', 'docs/', 'a/b/', 'dir.md/', 'dir\\sub\\'),
    fc.oneof(
      fc.stringMatching(/^[a-z]{1,8}$/),
      fc.constantFrom('.md', '.hidden', 'README'),
      hangul.map((h) => 'k' + h),
    ),
    extensionArb,
  )
  .map(([dir, name, ext]) => dir + name + ext);

/** Lists of `{ path, text }` with varied extension casing. */
export const scanInputs: fc.Arbitrary<ScanInput[]> = fc.array(
  fc.record({ path: pathArb, text: anyText }),
  { maxLength: 5 },
);

// -- Oracle: positions --------------------------------------------------------

/**
 * Line and column (both 1-based, in code points) of the code point at `offset`.
 * Straightforward array walk, separate from the streaming counters.
 */
export function refPosition(text: string, offset: number): { line: number; column: number } {
  const cps = toCodePoints(text);
  let line = 1;
  let lineStart = 0;
  for (let k = 0; k < offset && k < cps.length; k++) {
    const c = cps[k];
    if (c === 0x0a) {
      line++;
      lineStart = k + 1;
    } else if (c === 0x0d && cps[k + 1] !== 0x0a) {
      line++;
      lineStart = k + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

// -- Oracle: tag sequences ----------------------------------------------------

/**
 * Code point indices of Tag_Characters that must be flagged. For each U+1F3F4 the
 * tag code points after it are cut after the first U+E007F and compared
 * element-wise with every table entry; a match is permitted, everything else flagged.
 */
export function refFlaggedTagIndices(cps: readonly number[]): Set<number> {
  const permitted = new Set<number>();
  for (let i = 0; i < cps.length; i++) {
    if (cps[i] !== BASE_FLAG) continue;
    let j = i + 1;
    while (j < cps.length && refCategory(cps[j] as number) === 'tag' && cps[j] !== CANCEL_TAG) j++;
    if (j < cps.length && cps[j] === CANCEL_TAG) {
      const candidate = cps.slice(i, j + 1);
      if (isListed(candidate)) {
        for (let k = i + 1; k <= j; k++) permitted.add(k);
        i = j;
      }
    }
  }
  const flagged = new Set<number>();
  cps.forEach((c, i) => {
    if (refCategory(c) === 'tag' && !permitted.has(i)) flagged.add(i);
  });
  return flagged;
}

/** Maximal runs of consecutive flagged tag indices as `{ start, length }`. */
export function refTagRuns(cps: readonly number[]): { start: number; length: number }[] {
  const flagged = refFlaggedTagIndices(cps);
  const runs: { start: number; length: number }[] = [];
  for (let i = 0; i < cps.length; i++) {
    if (!flagged.has(i)) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.start + last.length === i) last.length++;
    else runs.push({ start: i, length: 1 });
  }
  return runs;
}

// -- Oracle: ZWJ --------------------------------------------------------------

function refIsExtendedPictographic(c: number): boolean {
  const r = EXTENDED_PICTOGRAPHIC_RANGES;
  for (let i = 0; i + 1 < r.length; i += 2) {
    if (c >= (r[i] as number) && c <= (r[i + 1] as number)) return true;
  }
  return false;
}

const refIsModifier = (c: number): boolean => c === 0xfe0f || (c >= 0x1f3fb && c <= 0x1f3ff);

/** True when the U+200D at code point index `i` is allowed (emoji on both sides, modifiers skipped). */
export function refZwjPermitted(cps: readonly number[], i: number): boolean {
  let b = i - 1;
  while (b >= 0 && refIsModifier(cps[b] as number)) b--;
  let f = i + 1;
  while (f < cps.length && refIsModifier(cps[f] as number)) f++;
  if (b < 0 || f >= cps.length) return false;
  return refIsExtendedPictographic(cps[b] as number) && refIsExtendedPictographic(cps[f] as number);
}

// -- Oracle: revealed text and occurrences ------------------------------------

/**
 * Revealed text: every flagged tag code point (by the tag oracle) is replaced by its
 * ASCII source (U+E0020..U+E007E) or by <U+XXXX>. Tags of permitted sequences stay literal.
 */
export function refRevealed(content: string): string {
  const cps = toCodePoints(content);
  const flagged = refFlaggedTagIndices(cps);
  let out = '';
  cps.forEach((c, i) => {
    if (!flagged.has(i)) out += String.fromCodePoint(c);
    else if (c >= 0xe0020 && c <= 0xe007e) out += String.fromCharCode(c - 0xe0000);
    else out += '<' + hex4(c) + '>';
  });
  return out;
}

/** Host of `<scheme>://<host>[:<port>][/<rest>]`, or undefined. */
export function refHostOf(value: string): string | undefined {
  const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/(?:[^/@]*@)?([^/:]+)(?::[0-9]*)?(?:\/[\s\S]*)?$/.exec(value);
  return m === null ? undefined : (m[1] as string);
}

const isHostBefore = (ch: string): boolean => /[A-Za-z0-9_.-]/.test(ch);
const isHostAfter = (ch: string): boolean => /[A-Za-z0-9_-]/.test(ch);

/** First index at which `host` occurs in `text` under the host boundary and ASCII case rules, or -1. */
export function refHostIndex(host: string, text: string): number {
  const h = host.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const t = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (let i = 0; i + h.length <= t.length; i++) {
    if (t.slice(i, i + h.length) !== h) continue;
    const before = i > 0 ? (text[i - 1] as string) : '';
    const after = i + h.length < text.length ? (text[i + h.length] as string) : '';
    if (before !== '' && isHostBefore(before)) continue;
    if (after !== '' && isHostAfter(after)) continue;
    return i;
  }
  return -1;
}

export interface RefOccurrence {
  readonly recordIndex: number;
  /** UTF-16 index in the revealed text of that record. */
  readonly index: number;
  readonly matchedKey: 'value' | 'host';
}

/**
 * First occurrence of a needle: the full value (case-sensitive) in the earliest record,
 * then the lowest index; only when no record has it, the host key. Naive scans over the
 * oracle's revealed texts.
 */
export function refFirstOccurrence(value: string, log: readonly ProvenanceRecord[]): RefOccurrence | undefined {
  const revealed = log.map((r) => refRevealed(r.content));
  for (let r = 0; r < revealed.length; r++) {
    const idx = (revealed[r] as string).indexOf(value);
    if (idx >= 0) return { recordIndex: r, index: idx, matchedKey: 'value' };
  }
  const host = refHostOf(value);
  if (host === undefined || host === '') return undefined;
  for (let r = 0; r < revealed.length; r++) {
    const idx = refHostIndex(host, revealed[r] as string);
    if (idx >= 0) return { recordIndex: r, index: idx, matchedKey: 'host' };
  }
  return undefined;
}
