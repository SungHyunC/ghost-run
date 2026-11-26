import {
  hostEntryKey,
  normalizePattern,
  sanitizeJudgeText,
  validateGlob,
  validateHostEntry,
} from '@ghost-run/core';
import type { Ward, WardSet } from '@ghost-run/core';
import { isMap, isPair, isScalar, isSeq } from 'yaml';
import type { LineCounter, Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml';
import type { ConfigError, ConfigErrorCode, ConfigWarning } from './types.js';

/** Shared state of one parse: the line counter and the two result collectors. */
export interface SchemaContext {
  readonly lc: LineCounter;
  readonly errors: ConfigError[];
  readonly warnings: ConfigWarning[];
}

export const MAX_WARDS = 256;
export const MAX_LIST_ENTRIES = 1000;
export const MAX_SAFE_COMMANDS = 256;
export const MAX_SAFE_COMMAND_LENGTH = 256;
export const MAX_TRUSTED_COMMANDS = 256;
export const MAX_TRUSTED_COMMAND_LENGTH = 256;

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TABLE_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const SAFE_COMMAND_RE = /^[A-Za-z0-9_./:=@%+,-]+( [A-Za-z0-9_./:=@%+,-]+)*$/;
const SAFE_COMMAND_CHARSET_RE = /^[A-Za-z0-9_./:=@%+, -]*$/;
const TRUSTED_TOKEN_RE = /^[A-Za-z0-9_./:=@%+,*-]+$/;
const KINDS = ['path', 'sql', 'egress', 'physics'] as const;
type Kind = (typeof KINDS)[number];

interface FieldSpec {
  readonly name: string;
  readonly required: boolean;
  readonly check: (c: Checker, value: Node | null, field: string) => unknown;
}

// -- Low-level helpers --------------------------------------------------------

/** Control characters and the hidden characters of Requirement 12 criterion 9. */
export function hasBadChar(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (
      cp <= 0x1f ||
      cp === 0x7f ||
      (cp >= 0x200b && cp <= 0x200d) ||
      cp === 0x2060 ||
      cp === 0xfeff ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2066 && cp <= 0x2069) ||
      (cp >= 0xe0000 && cp <= 0xe007f)
    ) {
      return true;
    }
  }
  return false;
}

function shown(s: string): string {
  return sanitizeJudgeText(s, 80);
}

function nodeStart(n: unknown): number | undefined {
  const r = (n as { range?: readonly number[] | null } | null | undefined)?.range;
  return r ? r[0] : undefined;
}

export function posOf(
  lc: LineCounter,
  n: unknown,
): { line: number; column: number } {
  const off = nodeStart(n);
  if (off === undefined) return { line: 1, column: 1 };
  const p = lc.linePos(off);
  return { line: p.line, column: p.col };
}

export function pushError(
  ctx: SchemaContext,
  code: ConfigErrorCode,
  at: unknown,
  message: string,
  extra: { wardId?: string; field?: string; detail?: string } = {},
): void {
  const { line, column } = posOf(ctx.lc, at);
  const e: ConfigError = {
    code,
    message,
    line,
    column,
    ...(extra.wardId !== undefined ? { wardId: extra.wardId } : {}),
    ...(extra.field !== undefined ? { field: extra.field } : {}),
    ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
  };
  ctx.errors.push(e);
}

function lineOf(ctx: SchemaContext, n: unknown): number {
  return posOf(ctx.lc, n).line;
}

function isStringScalar(n: unknown): n is Scalar<string> {
  return isScalar(n) && typeof n.value === 'string';
}

// -- Per-ward checker ----------------------------------------------------------

class Checker {
  constructor(
    readonly ctx: SchemaContext,
    readonly wardId: string | undefined,
  ) {}

  err(code: ConfigErrorCode, at: unknown, message: string, field?: string, detail?: string): void {
    pushError(this.ctx, code, at, message, {
      ...(this.wardId !== undefined ? { wardId: this.wardId } : {}),
      ...(field !== undefined ? { field } : {}),
      ...(detail !== undefined ? { detail } : {}),
    });
  }

  /** A string scalar with no control or hidden character; reports and returns undefined otherwise. */
  str(n: Node | null, field: string): string | undefined {
    if (!isStringScalar(n)) {
      this.err('wrong-type', n, `field "${field}" must be a string`, field);
      return undefined;
    }
    if (hasBadChar(n.value)) {
      this.err('invalid-character', n, `field "${field}" contains a control or hidden character`, field);
      return undefined;
    }
    return n.value;
  }

  bool(n: Node | null, field: string): boolean | undefined {
    if (!isScalar(n) || typeof n.value !== 'boolean') {
      this.err('wrong-type', n, `field "${field}" must be a boolean`, field);
      return undefined;
    }
    return n.value;
  }

  /** A number scalar; `check` returns false for an out-of-range value. */
  num(
    n: Node | null,
    field: string,
    inRange: (v: number) => boolean,
    rangeText: string,
  ): number | undefined {
    if (!isScalar(n) || typeof n.value !== 'number') {
      this.err('wrong-type', n, `field "${field}" must be a number`, field);
      return undefined;
    }
    if (!inRange(n.value)) {
      this.err('out-of-range', n, `field "${field}" must be ${rangeText}`, field);
      return undefined;
    }
    return n.value;
  }

  /**
   * A sequence of strings. `entry` validates one string (return false after
   * reporting). `keyOf` gives the duplicate key. Returns the list when no error was found.
   */
  list(
    n: Node | null,
    field: string,
    min: number,
    max: number,
    entry: (s: string, item: Node, f: string) => boolean,
    keyOf: (s: string) => string,
  ): string[] | undefined {
    if (!isSeq(n)) {
      this.err('wrong-type', n, `field "${field}" must be a list`, field);
      return undefined;
    }
    let ok = true;
    if (n.items.length < min || n.items.length > max) {
      this.err('out-of-range', n, `field "${field}" must have ${min} to ${max} entries`, field);
      ok = false;
    }
    const out: string[] = [];
    const seen = new Map<string, number>();
    n.items.forEach((item, i) => {
      const f = `${field}[${i}]`;
      if (isPair(item) || !isStringScalar(item)) {
        this.err('wrong-type', isPair(item) ? item.key : item, `field "${f}" must be a string`, f);
        ok = false;
        return;
      }
      if (hasBadChar(item.value)) {
        this.err('invalid-character', item, `field "${f}" contains a control or hidden character`, f);
        ok = false;
        return;
      }
      if (!entry(item.value, item, f)) {
        ok = false;
        return;
      }
      const key = keyOf(item.value);
      const first = seen.get(key);
      if (first !== undefined) {
        this.err('duplicate-entry', item, `field "${f}" repeats the entry on line ${first}`, f);
        ok = false;
        return;
      }
      seen.set(key, lineOf(this.ctx, item));
      out.push(item.value);
    });
    return ok ? out : undefined;
  }

  globEntry(s: string, item: Node, f: string): boolean {
    const g = validateGlob(s);
    if (g) {
      this.err('invalid-glob', item, `field "${f}" is not a valid glob: "${shown(s)}" (${g.code})`, f, g.code);
      return false;
    }
    const norm = normalizePattern(s);
    if (norm === '' || norm === '**') {
      const { line, column } = posOf(this.ctx.lc, item);
      this.ctx.warnings.push({
        code: 'catch-all-pattern',
        message: `field "${f}" matches the whole copy`,
        line,
        column,
      });
    }
    return true;
  }
}

// -- Field tables ---------------------------------------------------------------

const globList =
  (min: number): FieldSpec['check'] =>
  (c, v, f) =>
    c.list(v, f, min, MAX_LIST_ENTRIES, (s, item, ff) => c.globEntry(s, item, ff), normalizePattern);

const FIELDS: Readonly<Record<Kind, readonly FieldSpec[]>> = {
  path: [
    {
      name: 'deny',
      required: true,
      check: (c, v, f) => {
        const r = c.list(
          v,
          f,
          1,
          2,
          (s, item, ff) => {
            if (s === 'delete' || s === 'overwrite') return true;
            c.err('out-of-range', item, `field "${ff}" must be "delete" or "overwrite"`, ff);
            return false;
          },
          (s) => s,
        );
        return r as ReadonlyArray<'delete' | 'overwrite'> | undefined;
      },
    },
    { name: 'paths', required: true, check: globList(1) },
    { name: 'case_sensitive', required: false, check: (c, v, f) => c.bool(v, f) },
  ],
  sql: [
    {
      name: 'tables',
      required: true,
      check: (c, v, f) =>
        c.list(
          v,
          f,
          1,
          MAX_LIST_ENTRIES,
          (s, item, ff) => {
            if (TABLE_RE.test(s)) return true;
            c.err('out-of-range', item, `field "${ff}" is not a valid table name`, ff);
            return false;
          },
          (s) => s.toLowerCase(),
        ),
    },
    {
      name: 'max_rows_lost',
      required: true,
      check: (c, v, f) =>
        c.num(v, f, (x) => Number.isSafeInteger(x) && x >= 0, 'a safe integer of at least 0'),
    },
  ],
  egress: [
    { name: 'secrets', required: true, check: globList(1) },
    {
      name: 'allow_hosts',
      required: true,
      check: (c, v, f) =>
        c.list(
          v,
          f,
          0,
          MAX_LIST_ENTRIES,
          (s, item, ff) => {
            const h = validateHostEntry(s);
            if (!h) return true;
            c.err('invalid-host', item, `field "${ff}" is not a valid host entry: "${shown(s)}" (${h.code})`, ff, h.code);
            return false;
          },
          hostEntryKey,
        ),
    },
  ],
  physics: [
    {
      name: 'min_success_rate',
      required: true,
      check: (c, v, f) =>
        c.num(v, f, (x) => Number.isFinite(x) && x >= 0 && x <= 1, 'a number from 0 to 1'),
    },
    {
      name: 'max_contact_force_n',
      required: true,
      check: (c, v, f) =>
        c.num(v, f, (x) => Number.isFinite(x) && x >= 0, 'a finite number of at least 0'),
    },
    {
      name: 'forbidden_contacts',
      required: true,
      check: (c, v, f) =>
        c.list(
          v,
          f,
          0,
          MAX_LIST_ENTRIES,
          (s, item, ff) => {
            if (s.length > 0) return true;
            c.err('out-of-range', item, `field "${ff}" must not be empty`, ff);
            return false;
          },
          (s) => s,
        ),
    },
  ],
};

// -- Ward and root validation ----------------------------------------------------

/** First pair of each key name in a mapping; later repeats are reported by the feature scan. */
function pairsByName(
  ctx: SchemaContext,
  map: YAMLMap,
  wardId?: string,
): Map<string, Pair> {
  const out = new Map<string, Pair>();
  for (const p of map.items) {
    if (!isScalar(p.key)) {
      pushError(ctx, 'wrong-type', p.key, 'a mapping key must be a plain name', {
        ...(wardId !== undefined ? { wardId } : {}),
      });
      continue;
    }
    const name = String(p.key.value);
    if (!out.has(name)) out.set(name, p);
  }
  return out;
}

function validateWard(
  ctx: SchemaContext,
  node: Node | null | unknown,
  index: number,
  idLines: Map<string, number>,
): Ward | undefined {
  if (!isMap(node)) {
    pushError(ctx, 'wrong-type', node, `field "wards[${index}]" must be a mapping`, {
      field: `wards[${index}]`,
    });
    return undefined;
  }
  const errorsBefore = ctx.errors.length;
  const pairs = pairsByName(ctx, node);

  // id
  let id: string | undefined;
  const idPair = pairs.get('id');
  const anon = new Checker(ctx, undefined);
  if (!idPair) {
    anon.err('missing-field', node, 'required field "id" is missing', 'id');
  } else {
    const s = anon.str(idPair.value as Node | null, 'id');
    if (s !== undefined) {
      if (!ID_RE.test(s)) {
        anon.err('out-of-range', idPair.value, 'field "id" must match ^[a-z0-9][a-z0-9-]{0,63}$', 'id');
      } else {
        id = s;
        const first = idLines.get(s);
        if (first !== undefined) {
          pushError(ctx, 'duplicate-id', node, `ward id "${s}" repeats the id on line ${first}`, {
            wardId: s,
            field: 'id',
          });
        } else {
          idLines.set(s, lineOf(ctx, node));
        }
      }
    }
  }

  const c = new Checker(ctx, id);

  // kind
  const kindPair = pairs.get('kind');
  let kind: Kind | undefined;
  if (!kindPair) {
    c.err('missing-field', node, 'required field "kind" is missing', 'kind');
  } else {
    const kn = kindPair.value as Node | null;
    if (!isStringScalar(kn)) {
      c.err('wrong-type', kn, 'field "kind" must be a string', 'kind');
    } else if ((KINDS as readonly string[]).includes(kn.value)) {
      kind = kn.value as Kind;
    } else {
      c.err('unknown-kind', node, `unknown kind; allowed values are ${KINDS.join(', ')}`, 'kind');
    }
  }
  if (kind === undefined) return undefined;

  const specs = FIELDS[kind];
  const values: Record<string, unknown> = {};
  for (const [name, pair] of pairs) {
    if (name === 'id' || name === 'kind') continue;
    if (!specs.some((s) => s.name === name)) {
      c.err('unknown-field', pair.key, `field "${shown(name)}" is not defined for kind "${kind}"`, shown(name));
    }
  }
  for (const spec of specs) {
    const pair = pairs.get(spec.name);
    if (!pair) {
      if (spec.required) {
        c.err('missing-field', node, `required field "${spec.name}" is missing`, spec.name);
      }
      continue;
    }
    values[spec.name] = spec.check(c, pair.value as Node | null, spec.name);
  }

  if (ctx.errors.length > errorsBefore || id === undefined) return undefined;
  const built: Record<string, unknown> = { id, kind };
  for (const spec of specs) {
    if (values[spec.name] !== undefined) built[spec.name] = values[spec.name];
  }
  return built as unknown as Ward;
}

interface CommandListSpec {
  readonly field: 'safe_commands' | 'trusted_commands';
  readonly max: number;
  readonly maxLength: number;
  /** Returns the `detail` of an unsafe entry, or undefined when the entry is fine. */
  readonly unsafeDetail: (s: string) => string | undefined;
}

function safeCommandDetail(s: string): string | undefined {
  if (SAFE_COMMAND_RE.test(s)) return undefined;
  return SAFE_COMMAND_CHARSET_RE.test(s) ? 'spacing' : 'charset';
}

/**
 * A trusted command pattern: words over the safe charset plus `*`, one space between words.
 * A word is `*` (exactly one word), a literal without `*`, or `**` as the last word only.
 */
function trustedPatternDetail(s: string): string | undefined {
  if (s.startsWith(' ') || s.endsWith(' ') || s.includes('  ')) return 'spacing';
  const words = s.split(' ');
  for (const w of words) if (!TRUSTED_TOKEN_RE.test(w)) return 'charset';
  for (let i = 0; i < words.length; i++) {
    const w = words[i] as string;
    if (w === '*') continue;
    if (w === '**' && i === words.length - 1) continue;
    if (w.includes('*')) return 'wildcard';
  }
  return undefined;
}

const SAFE_SPEC: CommandListSpec = {
  field: 'safe_commands',
  max: MAX_SAFE_COMMANDS,
  maxLength: MAX_SAFE_COMMAND_LENGTH,
  unsafeDetail: safeCommandDetail,
};

const TRUSTED_SPEC: CommandListSpec = {
  field: 'trusted_commands',
  max: MAX_TRUSTED_COMMANDS,
  maxLength: MAX_TRUSTED_COMMAND_LENGTH,
  unsafeDetail: trustedPatternDetail,
};

function validateCommandList(ctx: SchemaContext, value: Node | null, spec: CommandListSpec): string[] | undefined {
  const field = spec.field;
  if (!isSeq(value)) {
    pushError(ctx, 'wrong-type', value, `field "${field}" must be a list`, { field });
    return undefined;
  }
  const errorsBefore = ctx.errors.length;
  if (value.items.length > spec.max) {
    pushError(ctx, 'out-of-range', value, `field "${field}" must have at most ${spec.max} entries`, { field });
  }
  const out: string[] = [];
  const seen = new Map<string, number>();
  value.items.forEach((item, i) => {
    const f = `${field}[${i}]`;
    const at = isPair(item) ? item.key : item;
    if (isPair(item) || !isStringScalar(item)) {
      pushError(ctx, 'wrong-type', at, `field "${f}" must be a string`, { field: f });
      return;
    }
    const s = item.value;
    if (hasBadChar(s)) {
      pushError(ctx, 'invalid-character', item, `field "${f}" contains a control or hidden character`, { field: f });
      return;
    }
    if (s.length === 0 || s.length > spec.maxLength) {
      pushError(ctx, 'out-of-range', item, `field "${f}" must have 1 to ${spec.maxLength} characters`, { field: f });
      return;
    }
    const detail = spec.unsafeDetail(s);
    if (detail !== undefined) {
      pushError(ctx, 'unsafe-command-entry', item, `field "${f}" is not a safe command entry (${detail})`, {
        field: f,
        detail,
      });
      return;
    }
    const first = seen.get(s);
    if (first !== undefined) {
      pushError(ctx, 'duplicate-entry', item, `field "${f}" repeats the entry on line ${first}`, { field: f });
      return;
    }
    seen.set(s, lineOf(ctx, item));
    if (spec.field === 'trusted_commands' && s.startsWith('*')) {
      const { line, column } = posOf(ctx.lc, item);
      ctx.warnings.push({
        code: 'catch-all-pattern',
        message: `field "${f}" starts with a wildcard and trusts any command name`,
        line,
        column,
      });
    }
    out.push(s);
  });
  return ctx.errors.length > errorsBefore ? undefined : out;
}

/**
 * Validates the document root and returns the parsed values. Errors and warnings
 * go to `ctx`. The caller returns the values only when `ctx.errors` is empty.
 */
export function validateRoot(
  ctx: SchemaContext,
  root: Node | null,
): { wardSet: WardSet; safeCommands: string[]; trustedCommands: string[] } | undefined {
  if (!isMap(root)) {
    pushError(ctx, 'root-not-mapping', root, 'the document root must be a mapping');
    return undefined;
  }
  const errorsBefore = ctx.errors.length;
  let wardsValue: Node | null | undefined;
  let safeValue: Node | null | undefined;
  let hasSafe = false;
  let trustedValue: Node | null | undefined;
  let hasTrusted = false;
  const seenRoot = new Set<string>();
  for (const p of root.items) {
    if (!isScalar(p.key)) {
      pushError(ctx, 'wrong-type', p.key, 'a mapping key must be a plain name');
      continue;
    }
    const name = String(p.key.value);
    if (seenRoot.has(name)) continue;
    seenRoot.add(name);
    if (name === 'wards') wardsValue = p.value as Node | null;
    else if (name === 'safe_commands') {
      hasSafe = true;
      safeValue = p.value as Node | null;
    } else if (name === 'trusted_commands') {
      hasTrusted = true;
      trustedValue = p.value as Node | null;
    } else {
      pushError(ctx, 'unknown-root-field', p.key, `unknown root field "${shown(name)}"`, {
        field: shown(name),
      });
    }
  }

  const wards: Ward[] = [];
  if (wardsValue === undefined) {
    pushError(ctx, 'wards-not-sequence', root, 'required root field "wards" is missing', { field: 'wards' });
  } else if (!isSeq(wardsValue)) {
    pushError(ctx, 'wards-not-sequence', wardsValue, 'field "wards" must be a list', { field: 'wards' });
  } else {
    const seq: YAMLSeq = wardsValue;
    if (seq.items.length > MAX_WARDS) {
      pushError(ctx, 'out-of-range', seq, `field "wards" must have at most ${MAX_WARDS} entries`, {
        field: 'wards',
      });
    }
    if (seq.items.length === 0) {
      const { line, column } = posOf(ctx.lc, seq);
      ctx.warnings.push({ code: 'empty-ward-set', message: 'the document defines no wards', line, column });
    }
    const idLines = new Map<string, number>();
    seq.items.forEach((item, i) => {
      const w = validateWard(ctx, isPair(item) ? item.key : item, i, idLines);
      if (w) wards.push(w);
    });
  }

  let safeCommands: string[] = [];
  if (hasSafe) {
    const s = validateCommandList(ctx, safeValue ?? null, SAFE_SPEC);
    if (s) safeCommands = s;
  }
  let trustedCommands: string[] = [];
  if (hasTrusted) {
    const t = validateCommandList(ctx, trustedValue ?? null, TRUSTED_SPEC);
    if (t) trustedCommands = t;
  }
  if (ctx.errors.length > errorsBefore) return undefined;
  return { wardSet: { wards }, safeCommands, trustedCommands };
}
