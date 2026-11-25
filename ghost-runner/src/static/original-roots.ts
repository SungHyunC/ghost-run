import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** Mount point of the Copy inside the box. */
export const COPY_ROOT = '/work';

/**
 * The Original root as given and its real path (on macOS `/var/...` and `/private/var/...`,
 * symlinked folders). Absolute, normalized, without duplicates; the filesystem root is never a root.
 * The one place that reads the file system for this; `analyze` and `mapOriginalToCopy` stay pure.
 */
export function originalRootsOf(original: string): string[] {
  const given = resolve(original);
  const roots = new Set<string>([given]);
  try {
    roots.add(realpathSync(given));
  } catch {
    // a missing folder has no real path; the given one is enough
  }
  roots.delete('/');
  return [...roots];
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/**
 * Replaces every occurrence of an Original root in `text` with the Copy root, at a path boundary:
 * the root must be followed by the end of the text, `/`, whitespace, a quote, or a shell operator
 * character (`; & | < > ( )` and the backtick), and must not continue an earlier path segment.
 * `<root>-demo` and `<root>2` are other folders and stay as they are. Pure.
 */
export function mapOriginalToCopy(text: string, roots: readonly string[]): string {
  const usable = roots.filter((r) => r.startsWith('/') && r !== '/').sort((a, b) => b.length - a.length);
  if (usable.length === 0) return text;
  const re = new RegExp(`(?<![\\w.~/-])(?:${usable.map(escapeRe).join('|')})(?=$|[/\\s'"\`;&|<>()])`, 'g');
  return text.replace(re, COPY_ROOT);
}

/**
 * Maps an absolute `cwd` that is, or is under, an Original root to the Copy. A box cwd is relative
 * to the Copy root, so the result is the part below it (`undefined` for the root itself).
 * Any other cwd is returned as given. Pure.
 */
export function mapCwdToCopy(cwd: string, roots: readonly string[]): string | undefined {
  const mapped = mapOriginalToCopy(cwd, roots);
  if (mapped === cwd) return cwd;
  const below = mapped.slice(COPY_ROOT.length).replace(/^\/+/, '');
  return below === '' ? undefined : below;
}
