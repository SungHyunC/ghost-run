import type { Ward, WardSet } from '@ghost-run/core';

/** Optional extras for {@link printWards}. */
export interface PrintOptions {
  readonly safeCommands?: readonly string[];
}

const PLAIN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const RESERVED = /^(?:true|false|null)$/i;

function isHidden(cp: number): boolean {
  return (
    cp <= 0x1f ||
    (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0xd800 && cp <= 0xdfff) ||
    (cp >= 0x200b && cp <= 0x200d) ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === 0x2060 ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff ||
    (cp >= 0xe0000 && cp <= 0xe007f)
  );
}

function hex(cp: number, width: number): string {
  return cp.toString(16).toUpperCase().padStart(width, '0');
}

function printString(s: string): string {
  if (PLAIN.test(s) && !RESERVED.test(s)) return s;
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (isHidden(cp)) out += cp > 0xffff ? `\\U${hex(cp, 8)}` : `\\u${hex(cp, 4)}`;
    else out += ch;
  }
  return `${out}"`;
}

function printNumber(n: number): string {
  return Object.is(n, -0) ? '0' : String(n);
}

function printList(items: readonly string[]): string {
  return `[${items.map(printString).join(', ')}]`;
}

function printWard(w: Ward): string[] {
  const lines = [`  - id: ${printString(w.id)}`, `    kind: ${printString(w.kind)}`];
  switch (w.kind) {
    case 'path':
      lines.push(`    deny: ${printList(w.deny)}`, `    paths: ${printList(w.paths)}`);
      if (w.case_sensitive !== undefined) {
        lines.push(`    case_sensitive: ${w.case_sensitive ? 'true' : 'false'}`);
      }
      break;
    case 'sql':
      lines.push(`    tables: ${printList(w.tables)}`, `    max_rows_lost: ${printNumber(w.max_rows_lost)}`);
      break;
    case 'egress':
      lines.push(`    secrets: ${printList(w.secrets)}`, `    allow_hosts: ${printList(w.allow_hosts)}`);
      break;
    case 'physics':
      lines.push(
        `    min_success_rate: ${printNumber(w.min_success_rate)}`,
        `    max_contact_force_n: ${printNumber(w.max_contact_force_n)}`,
        `    forbidden_contacts: ${printList(w.forbidden_contacts)}`,
      );
      break;
  }
  return lines;
}

/**
 * Prints a WardSet as canonical wards.yaml text. Pure: writes no file and
 * does not preserve comments. A non-empty `safeCommands` list is appended as
 * one top-level `safe_commands` flow sequence; an absent or empty list omits it.
 */
export function printWards(wardSet: WardSet, options?: PrintOptions): string {
  const lines: string[] = [];
  if (wardSet.wards.length === 0) lines.push('wards: []');
  else {
    lines.push('wards:');
    for (const w of wardSet.wards) lines.push(...printWard(w));
  }
  const sc = options?.safeCommands;
  if (sc !== undefined && sc.length > 0) lines.push(`safe_commands: ${printList(sc)}`);
  return `${lines.join('\n')}\n`;
}
