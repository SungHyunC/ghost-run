import type {
  Change,
  Effect,
  FingerprintResult,
  Scene,
  Snapshot,
  World,
} from '../../src/index.js';

// Deterministic in-memory file-system World used by the P5 test.
// It has its own path resolver (independent of core/src/judge): lexical
// cleanup, ASCII case-insensitive lookup that reports the stored spelling, and
// symbolic-link resolution. Changes carry the resolved real path. A move is a
// delete at the source plus a create (or overwrite) at the destination.

export interface FsState {
  /** Resolved real path -> content. */
  readonly files: Readonly<Record<string, string>>;
  /** Link path -> target path (as written, lexically cleaned). */
  readonly links: Readonly<Record<string, string>>;
}

export type FsLeafAction =
  | { readonly op: 'rm'; readonly path: string }
  | { readonly op: 'rm-recursive'; readonly path: string }
  | { readonly op: 'rm-glob'; readonly pattern: string }
  | { readonly op: 'find-delete'; readonly root: string; readonly suffix?: string }
  | { readonly op: 'mv'; readonly from: string; readonly to: string }
  | { readonly op: 'overwrite'; readonly path: string; readonly content: string }
  | { readonly op: 'ln'; readonly link: string; readonly target: string };

export type FsAction =
  | FsLeafAction
  | { readonly op: 'script'; readonly actions: readonly FsLeafAction[] };

const encoder = new TextEncoder();

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** Split on `/`, drop empty and `.` segments, let `..` pop (never above the root). */
function lexical(p: string): string[] {
  const out: string[] = [];
  for (const s of p.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') {
      out.pop();
      continue;
    }
    out.push(s);
  }
  return out;
}

function childIndex(files: ReadonlyMap<string, string>, links: ReadonlyMap<string, string>): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const key of [...files.keys(), ...links.keys()]) {
    const segs = key.split('/');
    for (let i = 0; i < segs.length; i += 1) {
      const parent = segs.slice(0, i).join('/');
      const set = index.get(parent) ?? new Set<string>();
      set.add(segs[i] as string);
      index.set(parent, set);
    }
  }
  return new Map([...index].map(([k, v]) => [k, [...v]]));
}

/** Resolve a spelling to the stored real path: case lookup, then links (depth-limited). */
function resolveReal(
  files: ReadonlyMap<string, string>,
  links: ReadonlyMap<string, string>,
  spelling: string,
): string {
  let segs = lexical(spelling);
  let last = segs.join('/');
  for (let depth = 0; depth < 16; depth += 1) {
    const index = childIndex(files, links);
    const out: string[] = [];
    let redirected = false;
    for (let i = 0; i < segs.length; i += 1) {
      const seg = segs[i] as string;
      const names = index.get(out.join('/')) ?? [];
      const exact = names.includes(seg);
      const folded = names.find((n) => n.toLowerCase() === seg.toLowerCase());
      out.push(exact ? seg : (folded ?? seg));
      const here = out.join('/');
      const target = links.get(here);
      if (target !== undefined) {
        segs = [...lexical(target), ...segs.slice(i + 1)];
        redirected = true;
        break;
      }
    }
    last = out.join('/');
    if (!redirected) return last;
  }
  return last;
}

function wild(p: string, s: string): boolean {
  if (p === '') return s === '';
  if (p[0] === '*') {
    for (let i = 0; i <= s.length; i += 1) if (wild(p.slice(1), s.slice(i))) return true;
    return false;
  }
  return s !== '' && p[0] === s[0] && wild(p.slice(1), s.slice(1));
}

function globMatches(pattern: string, path: string): boolean {
  const ps = lexical(pattern);
  const xs = path.split('/');
  if (path === '' || ps.length !== xs.length) return false;
  return ps.every((p, i) => wild(p.toLowerCase(), (xs[i] as string).toLowerCase()));
}

function underRoot(root: string, path: string): boolean {
  return root === '' || path === root || path.startsWith(`${root}/`);
}

/** Apply one non-script action to mutable maps. Returns an error message or undefined. */
function applyLeaf(
  files: Map<string, string>,
  links: Map<string, string>,
  a: FsLeafAction,
): string | undefined {
  switch (a.op) {
    case 'rm': {
      files.delete(resolveReal(files, links, a.path));
      return undefined;
    }
    case 'rm-recursive': {
      const root = resolveReal(files, links, a.path);
      for (const key of [...files.keys()]) if (underRoot(root, key)) files.delete(key);
      return undefined;
    }
    case 'rm-glob': {
      for (const key of [...files.keys()]) if (globMatches(a.pattern, key)) files.delete(key);
      return undefined;
    }
    case 'find-delete': {
      const root = resolveReal(files, links, a.root);
      const suffix = (a.suffix ?? '').toLowerCase();
      for (const key of [...files.keys()]) {
        if (underRoot(root, key) && key.toLowerCase().endsWith(suffix)) files.delete(key);
      }
      return undefined;
    }
    case 'mv': {
      const src = resolveReal(files, links, a.from);
      const content = files.get(src);
      if (content === undefined) return `mv: no such file "${a.from}"`;
      files.delete(src);
      files.set(resolveReal(files, links, a.to), content);
      return undefined;
    }
    case 'overwrite': {
      files.set(resolveReal(files, links, a.path), a.content);
      return undefined;
    }
    case 'ln': {
      links.set(lexical(a.link).join('/'), lexical(a.target).join('/'));
      return undefined;
    }
  }
}

function toRecord(m: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries([...m].sort(([x], [y]) => cmp(x, y)));
}

function applyAction(state: FsState, a: FsAction): { state: FsState; error?: string } {
  const files = new Map(Object.entries(state.files));
  const links = new Map(Object.entries(state.links));
  let error: string | undefined;
  const leaves = a.op === 'script' ? a.actions : [a];
  for (const leaf of leaves) {
    const e = applyLeaf(files, links, leaf);
    if (error === undefined) error = e;
  }
  const next: FsState = { files: toRecord(files), links: toRecord(links) };
  return error === undefined ? { state: next } : { state: next, error };
}

function copyState(s: FsState): FsState {
  return {
    files: Object.fromEntries(Object.entries(s.files)),
    links: Object.fromEntries(Object.entries(s.links)),
  };
}

export class FsWorld implements World<FsState, FsAction> {
  private readonly live: FsState;
  private counter = 0;

  constructor(initial: FsState = { files: {}, links: {} }) {
    this.live = copyState(initial);
  }

  private nextId(): string {
    this.counter += 1;
    return `fs-${this.counter}`;
  }

  async snapshot(): Promise<Snapshot<FsState>> {
    return { id: this.nextId(), state: copyState(this.live), result: { success: true } };
  }

  async step(s: Snapshot<FsState>, a: FsAction): Promise<Snapshot<FsState>> {
    const { state, error } = applyAction(s.state, a);
    return {
      id: this.nextId(),
      state,
      result: error === undefined ? { success: true } : { success: false, error },
    };
  }

  diff(before: Snapshot<FsState>, after: Snapshot<FsState>): Change[] {
    const changes: Change[] = [];
    const b = before.state.files;
    const a = after.state.files;
    for (const path of [...new Set([...Object.keys(b), ...Object.keys(a)])].sort(cmp)) {
      const bv = b[path];
      const av = a[path];
      if (av === undefined) changes.push({ kind: 'file-deleted', path });
      else if (bv === undefined) changes.push({ kind: 'file-created', path });
      else if (bv !== av) changes.push({ kind: 'file-overwritten', path });
    }
    const bl = before.state.links;
    const al = after.state.links;
    for (const path of [...new Set([...Object.keys(bl), ...Object.keys(al)])].sort(cmp)) {
      const targetBefore = bl[path];
      const targetAfter = al[path];
      if (targetBefore !== targetAfter) {
        changes.push({
          kind: 'symlink-changed',
          path,
          ...(targetBefore === undefined ? {} : { targetBefore }),
          ...(targetAfter === undefined ? {} : { targetAfter }),
        });
      }
    }
    return changes;
  }

  render(s: Snapshot<FsState>): Scene {
    return {
      files: Object.keys(s.state.files).sort(cmp),
      links: Object.entries(s.state.links)
        .sort(([x], [y]) => cmp(x, y))
        .map(([link, target]) => `${link} -> ${target}`),
    };
  }

  async fingerprint(): Promise<FingerprintResult> {
    const manifest: Record<string, string> = {};
    const parts: string[] = [];
    for (const path of Object.keys(this.live.files).sort(cmp)) {
      const content = this.live.files[path] as string;
      manifest[`file:${path}`] = await sha256Hex(content);
      parts.push(JSON.stringify(['file', path, content]));
    }
    for (const path of Object.keys(this.live.links).sort(cmp)) {
      const target = this.live.links[path] as string;
      manifest[`link:${path}`] = await sha256Hex(target);
      parts.push(JSON.stringify(['link', path, target]));
    }
    return { hash: await sha256Hex(`[${parts.join(',')}]`), manifest };
  }

  effectsOutside(_a: FsAction): Effect[] {
    return [];
  }
}
