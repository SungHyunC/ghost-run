import { DETAIL_MAX } from './limits';
import { detail } from './escape';

export type Unreadable = { readonly kind: 'unreadable' };

/** Non-null, non-array object. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Allow_List_Projection: returns only the named own properties of a record.
 * Returns null when `v` is not a record or when reading a property throws.
 */
export function pick<K extends string>(v: unknown, ...keys: K[]): Partial<Record<K, unknown>> | null {
  if (!isRecord(v)) return null;
  const out: Partial<Record<K, unknown>> = {};
  try {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = v[k];
    }
  } catch {
    return null;
  }
  return out;
}

export function arrayOf(v: unknown): readonly unknown[] | null {
  return Array.isArray(v) ? (v as readonly unknown[]) : null;
}

/** string -> escaped and cut; number, boolean, bigint, null -> String(v); anything else -> '[non-primitive]'. */
export function displayPrimitive(v: unknown, max: number = DETAIL_MAX): string {
  if (typeof v === 'string') return detail(v, max);
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' || v === null) return String(v);
  return '[non-primitive]';
}
