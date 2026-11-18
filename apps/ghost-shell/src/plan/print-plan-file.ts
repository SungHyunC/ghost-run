import { isHiddenDisplay } from '../ui-imports';
import type { PlanFile } from './plan-file';

const HEX = '0123456789ABCDEF';

function unit(u: number): string {
  return '\\u' + HEX[(u >> 12) & 15]! + HEX[(u >> 8) & 15]! + HEX[(u >> 4) & 15]! + HEX[u & 15]!;
}

/** JSON string with every code point above U+007E, every control, and every hidden code point escaped. */
function str(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    const cp = s.codePointAt(i) ?? u;
    if (cp > 0xffff) {
      // A pair above U+FFFF is written as two escapes, one per code unit.
      out += unit(u) + unit(s.charCodeAt(i + 1));
      i += 1;
    } else if (u === 0x22) out += '\\"';
    else if (u === 0x5c) out += '\\\\';
    else if (u < 0x20 || u > 0x7e || isHiddenDisplay(u)) out += unit(u);
    else out += s[i];
  }
  return out + '"';
}

function joinLines(items: readonly string[], indent: string): string {
  return items.map((x, i) => indent + x + (i < items.length - 1 ? ',' : '')).join('\n');
}

/** Canonical Plan_File text: two-space indent, fixed key order, ASCII only, trailing newline. */
export function printPlanFile(plan: PlanFile): string {
  const parts: string[] = [
    `  "format": ${str(plan.format)}`,
    `  "version": ${String(plan.version)}`,
    `  "name": ${str(plan.name)}`,
    `  "origin": ${str(plan.origin)}`,
  ];
  const actions = plan.actions.map((a) =>
    a.cwd === undefined
      ? `{ "command": ${str(a.command)} }`
      : `{ "command": ${str(a.command)}, "cwd": ${str(a.cwd)} }`,
  );
  parts.push(`  "actions": [\n${joinLines(actions, '    ')}\n  ]`);
  if (plan.note !== undefined) parts.push(`  "note": ${str(plan.note)}`);
  if (plan.provenance !== undefined) {
    const recs = plan.provenance.map(
      (r) => `{ "source": ${str(r.source)}, "kind": ${str(r.kind)}, "content": ${str(r.content)} }`,
    );
    parts.push(recs.length === 0 ? '  "provenance": []' : `  "provenance": [\n${joinLines(recs, '    ')}\n  ]`);
  }
  if (plan.readings !== undefined) parts.push(`  "readings": [${plan.readings.map(str).join(', ')}]`);
  return `{\n${parts.join(',\n')}\n}\n`;
}
