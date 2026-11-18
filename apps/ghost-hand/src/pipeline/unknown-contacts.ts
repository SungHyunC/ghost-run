// Req 4.7: forbidden_contacts entries that are not Contact_Names of this world.
import type { WardSet } from '@ghost-run/core';

/** Distinct unknown entries of every physics ward, in order of first appearance. */
export function findUnknownContacts(wardSet: WardSet, contactNames: readonly string[]): string[] {
  const out: string[] = [];
  for (const w of wardSet.wards) {
    if (w.kind !== 'physics') continue;
    for (const name of w.forbidden_contacts) {
      if (!contactNames.includes(name) && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

/** Union of the forbidden_contacts lists of every physics ward (Req 8.4). */
export function forbiddenContactUnion(wardSet: WardSet): string[] {
  const out: string[] = [];
  for (const w of wardSet.wards) {
    if (w.kind !== 'physics') continue;
    for (const name of w.forbidden_contacts) if (!out.includes(name)) out.push(name);
  }
  return out;
}
