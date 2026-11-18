import { GENERIC_DEPTH, DETAIL_MAX } from './limits';
import { compact } from './escape';
import { displayPrimitive } from './guards';
import { HIDDEN_SECRET } from './texts';

// Secret-like key redaction (design D13). A key-name heuristic; values are never inspected.

export const SECRET_LIKE_WORDS: readonly string[] = [
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

export const HIDDEN_SECRET_TEXT: typeof HIDDEN_SECRET = HIDDEN_SECRET;

/** True iff the lower-cased raw key contains at least one secret-like word. */
export function isSecretLikeKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_LIKE_WORDS.some((w) => k.includes(w));
}

export type MarkerText = '[nested too deep]' | '[circular reference]' | '[non-primitive]' | '[unreadable value]';

export type GenericNode =
  | { readonly kind: 'primitive'; readonly text: string }
  | { readonly kind: 'hidden'; readonly text: typeof HIDDEN_SECRET }
  | { readonly kind: 'object'; readonly entries: readonly { readonly key: string; readonly node: GenericNode }[] }
  | { readonly kind: 'array'; readonly items: readonly GenericNode[] }
  | { readonly kind: 'marker'; readonly text: MarkerText };

export interface GenericLimits {
  readonly maxDepth: number;
}

const DEFAULT_LIMITS: GenericLimits = { maxDepth: GENERIC_DEPTH };

function marker(text: MarkerText): GenericNode {
  return { kind: 'marker', text };
}

function build(
  value: unknown,
  key: string | null,
  depth: number,
  maxDepth: number,
  ancestors: Set<object>,
): GenericNode {
  // A secret-like key hides the whole subtree before the value is read.
  if (key !== null && isSecretLikeKey(key)) return { kind: 'hidden', text: HIDDEN_SECRET };

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    value === null
  ) {
    return { kind: 'primitive', text: displayPrimitive(value, DETAIL_MAX) };
  }

  if (typeof value !== 'object') return marker('[non-primitive]');

  let isArr: boolean;
  try {
    if (Array.isArray(value)) {
      isArr = true;
    } else {
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return marker('[non-primitive]');
      isArr = false;
    }
  } catch {
    return marker('[unreadable value]');
  }

  if (depth >= maxDepth) return marker('[nested too deep]');
  if (ancestors.has(value)) return marker('[circular reference]');

  ancestors.add(value);
  try {
    if (isArr) {
      const arr = value as unknown[];
      const length = arr.length;
      const items: GenericNode[] = [];
      for (let i = 0; i < length; i++) {
        let child: GenericNode;
        try {
          child = build(arr[i], null, depth + 1, maxDepth, ancestors);
        } catch {
          child = marker('[unreadable value]');
        }
        items.push(child);
      }
      return { kind: 'array', items };
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const entries: { key: string; node: GenericNode }[] = [];
    for (const k of keys) {
      let node: GenericNode;
      try {
        node = build(obj[k], k, depth + 1, maxDepth, ancestors);
      } catch {
        node = marker('[unreadable value]');
      }
      entries.push({ key: k, node });
    }
    return { kind: 'object', entries };
  } catch {
    return marker('[unreadable value]');
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Total, non-mutating redaction of any value. `key` is the key under which the value sits,
 * or null for a root value or an array element.
 */
export function redactGenericValue(value: unknown, key: string | null, limits?: GenericLimits): GenericNode {
  try {
    return build(value, key, 0, (limits ?? DEFAULT_LIMITS).maxDepth, new Set<object>());
  } catch {
    return marker('[unreadable value]');
  }
}

export interface GenericRow {
  readonly depth: number;
  readonly key: string;
  readonly valueText: string;
  readonly hidden: boolean;
}

/** Pre-order rows. The root row has the empty key; an array element has the key `[<i>]`. */
export function flattenGeneric(root: GenericNode): readonly GenericRow[] {
  const rows: GenericRow[] = [];
  const visit = (node: GenericNode, key: string, depth: number): void => {
    switch (node.kind) {
      case 'primitive':
      case 'marker':
        rows.push({ depth, key, valueText: node.text, hidden: false });
        return;
      case 'hidden':
        rows.push({ depth, key, valueText: HIDDEN_SECRET_TEXT, hidden: true });
        return;
      case 'object':
        rows.push({ depth, key, valueText: `{${node.entries.length} fields}`, hidden: false });
        for (const e of node.entries) visit(e.node, compact(e.key), depth + 1);
        return;
      case 'array':
        rows.push({ depth, key, valueText: `[${node.items.length} items]`, hidden: false });
        node.items.forEach((item, i) => visit(item, `[${i}]`, depth + 1));
        return;
    }
  };
  visit(root, '', 0);
  return rows;
}
