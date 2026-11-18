import { LineCounter, isAlias, isCollection, isMap, isPair, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node } from 'yaml';
import { sanitizeJudgeText } from '@ghost-run/core';
import { posOf, pushError, validateRoot } from './schema.js';
import type { SchemaContext } from './schema.js';
import type { ConfigError, ConfigWarning, ParseResult } from './types.js';

export const MAX_INPUT_BYTES = 262_144;
const MAX_ERRORS = 50;
const MAX_DEPTH = 8;
const MAX_INDENT = 64;
const MAX_BRACKET_RUN = 64;

function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

function fail(errors: readonly ConfigError[]): ParseResult {
  const sorted = [...errors].sort(compareErrors);
  if (sorted.length <= MAX_ERRORS) return { ok: false, errors: sorted };
  const kept = sorted.slice(0, MAX_ERRORS);
  kept.push({ code: 'too-many-errors', message: 'more than 50 errors; the rest are not shown' });
  return { ok: false, errors: kept };
}

function compareErrors(a: ConfigError, b: ConfigError): number {
  const al = a.line ?? Number.MAX_SAFE_INTEGER;
  const bl = b.line ?? Number.MAX_SAFE_INTEGER;
  if (al !== bl) return al - bl;
  const ac = a.column ?? Number.MAX_SAFE_INTEGER;
  const bc = b.column ?? Number.MAX_SAFE_INTEGER;
  if (ac !== bc) return ac - bc;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** Linear pre-scan (decision D19): deep indentation and long bracket runs. */
function preScan(text: string): ConfigError[] {
  const errors: ConfigError[] = [];
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    let indent = 0;
    while (indent < line.length && line.charCodeAt(indent) === 0x20) indent++;
    if (indent > MAX_INDENT) {
      errors.push({
        code: 'yaml-feature-unsupported',
        message: `indentation deeper than ${MAX_INDENT} spaces is not supported`,
        line: i + 1,
        column: 1,
      });
      continue;
    }
    let run = 0;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '[' || ch === '{') {
        run++;
        if (run > MAX_BRACKET_RUN) {
          errors.push({
            code: 'yaml-feature-unsupported',
            message: `more than ${MAX_BRACKET_RUN} nested brackets are not supported`,
            line: i + 1,
            column: j + 1 - MAX_BRACKET_RUN,
          });
          break;
        }
      } else run = 0;
    }
  }
  return errors;
}

/**
 * Walks the whole AST without `toJS`: anchors, aliases, explicit tags, the `<<` key,
 * depth over 8, and repeated mapping keys. Returns true when a feature error was found.
 */
function scanFeatures(ctx: SchemaContext, root: Node | null): boolean {
  let unsupported = false;
  const feature = (at: unknown, what: string): void => {
    unsupported = true;
    pushError(ctx, 'yaml-feature-unsupported', at, `${what} is not supported`);
  };
  const visit = (n: unknown, depth: number): void => {
    if (n === null || n === undefined) return;
    if (isAlias(n)) {
      feature(n, 'an alias');
      return;
    }
    const tagged = n as { anchor?: string; tag?: string };
    if (tagged.anchor !== undefined) feature(n, 'an anchor');
    if (tagged.tag !== undefined) feature(n, 'an explicit tag');
    if (!isCollection(n)) return;
    if (depth > MAX_DEPTH) {
      feature(n, `nesting deeper than ${MAX_DEPTH} levels`);
      return;
    }
    if (isMap(n)) {
      const first = new Map<string, number>();
      for (const p of n.items) {
        if (isScalar(p.key)) {
          const name = String(p.key.value);
          if (name === '<<') feature(p.key, 'the merge key "<<"');
          const seen = first.get(name);
          if (seen !== undefined) {
            pushError(ctx, 'duplicate-key', p.key, `duplicate key "${sanitizeJudgeText(name, 80)}"; first on line ${seen}`);
          } else first.set(name, posOf(ctx.lc, p.key).line);
        }
        visit(p.key, depth + 1);
        visit(p.value, depth + 1);
      }
    } else if (isSeq(n)) {
      for (const item of n.items) {
        if (isPair(item)) {
          visit(item.key, depth + 1);
          visit(item.value, depth + 1);
        } else visit(item, depth + 1);
      }
    }
  };
  visit(root, 1);
  return unsupported;
}

function parseInner(text: string): ParseResult {
  if (utf8Length(text) > MAX_INPUT_BYTES) {
    return fail([
      { code: 'input-too-large', message: `input is larger than ${MAX_INPUT_BYTES} bytes` },
    ]);
  }
  const pre = preScan(text);
  if (pre.length > 0) return fail(pre);

  const lc = new LineCounter();
  // `maxAliasCount` is a toJS option; the AST is never converted with toJS and aliases are rejected by the walk.
  const doc = parseDocument(text, {
    lineCounter: lc,
    schema: 'core',
    version: '1.2',
    merge: false,
    uniqueKeys: false,
    prettyErrors: false,
  });
  if (doc.errors.length > 0) {
    return fail(
      doc.errors.map((e) => {
        const p = lc.linePos(e.pos[0]);
        return {
          code: 'yaml-syntax-error' as const,
          message: `YAML syntax error (${e.code})`,
          line: p.line,
          column: p.col,
        };
      }),
    );
  }

  const errors: ConfigError[] = [];
  const warnings: ConfigWarning[] = [];
  const ctx: SchemaContext = { lc, errors, warnings };
  const root = doc.contents as Node | null;
  const unsupported = scanFeatures(ctx, root);
  if (unsupported) return fail(errors);
  const result = validateRoot(ctx, root);
  if (errors.length > 0 || result === undefined) return fail(errors);
  return { ok: true, wardSet: result.wardSet, safeCommands: result.safeCommands, warnings };
}

/** Parses `wards.yaml` text. Never throws. */
export function parseWards(text: string): ParseResult {
  try {
    return parseInner(text);
  } catch {
    return {
      ok: false,
      errors: [
        { code: 'yaml-syntax-error', message: 'the input could not be parsed', line: 1, column: 1 },
      ],
    };
  }
}
