// Feature: ghost-cloud, Property 5: Parser totality
// **Validates: Requirements 1.2, 1.3, 12.5**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PARSE_REASONS, parseLine } from '../src/parse.js';
import { NUM_RUNS, PBT_TIMEOUT } from './pbt-config.js';
import { actionArb } from './support/arbitraries.js';
import { formatAction } from './support/format-action.js';

const HIDDEN = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069, 0xe0041, 0xe007f].map((c) =>
  String.fromCodePoint(c),
);

const randomText = fc.string({ unit: 'binary', maxLength: 80 });
const randomUnicode = fc.string({ unit: 'grapheme', maxLength: 60 });

const validLine = actionArb.map(formatAction);

const mutatedLine: fc.Arbitrary<string> = fc
  .tuple(
    validLine,
    fc.constantFrom('extra', 'insert-option', 'operator', 'long', 'hidden', 'tab', 'drop-token', 'dup-token'),
    fc.nat(),
    fc.constantFrom('ls', 'foo', '--bogus', '--force', 'x y'),
    fc.constantFrom(';', '|', '&', '`', '$(', '<', '>', '&&'),
    fc.constantFrom(...HIDDEN),
  )
  .map(([line, how, n, word, op, hidden]) => {
    const tokens = line.split(' ');
    const at = tokens.length === 0 ? 0 : n % tokens.length;
    switch (how) {
      case 'extra':
        return `${line} ${word}`;
      case 'insert-option':
        return [...tokens.slice(0, 3), '--bogus-option', ...tokens.slice(3)].join(' ');
      case 'operator':
        return `${line} ${op} ls`;
      case 'long':
        return `${line} ${'a'.repeat(1030)}`;
      case 'hidden':
        return `${line.slice(0, n % (line.length + 1))}${hidden}${line.slice(n % (line.length + 1))}`;
      case 'tab':
        return line.replace(' ', '\t');
      case 'drop-token':
        return tokens.filter((_, i) => i !== at).join(' ');
      default:
        return [...tokens, tokens[at] as string].join(' ');
    }
  });

/** Drops a trailing slash after a bare bucket (`s3://b/` means the same as `s3://b`). */
function normalizedTokens(line: string): string[] {
  return line
    .split(' ')
    .filter((t) => t !== '' && !t.startsWith('BlockPublicAcls='))
    .map((t) => (/^s3:\/\/[^/]+\/$/.test(t) ? t.slice(0, -1) : t))
    .sort();
}

function checkParse(line: string): boolean {
  const a = parseLine(line);
  if (a.kind === 'unsupported') {
    return PARSE_REASONS.includes(a.reason) && typeof a.line === 'string' && a.line.length <= 1024;
  }
  // A supported result must be exactly one form of the table.
  if (line.length > 1024 || !/^[\u0020-\u007e]*$/.test(line)) return false;
  if (/[;|&`<>]|\$\(/.test(line)) return false;
  const canonical = formatAction(a);
  const again = parseLine(canonical);
  if (JSON.stringify(again) !== JSON.stringify(a)) return false;
  const got = normalizedTokens(line);
  const want = normalizedTokens(canonical);
  return got.length === want.length && got.every((t, i) => t === want[i]);
}

describe('Property 5: parser totality', () => {
  const run = (arb: fc.Arbitrary<string>): void =>
    fc.assert(
      fc.property(arb, (line) => {
        expect(() => parseLine(line)).not.toThrow();
        return checkParse(line);
      }),
      { numRuns: NUM_RUNS },
    );

  it('random binary strings', () => run(randomText), PBT_TIMEOUT);
  it('random Unicode strings', () => run(randomUnicode), PBT_TIMEOUT);
  it('mutations of valid lines', () => run(mutatedLine), PBT_TIMEOUT);
  it('valid lines', () => run(validLine), PBT_TIMEOUT);

  it('a non-string input is unsupported, not a throw', () => {
    const a = parseLine(undefined as unknown as string);
    expect(a.kind).toBe('unsupported');
  });
});
