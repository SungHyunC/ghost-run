// Write and delete tool judgment (task 6.3, Requirement 6). No ghost runs.
// Reads the workspace only, through an injected FsView. No LLM calls.
// Claims no P1. Claims P5 only for the declared target path at judgment time;
// a `code` edit makes no claim for other files that a symbol rename touches.

import { lstat, readdir, realpath } from 'node:fs/promises';
import * as nodePath from 'node:path';
import { WardEngine, foldPath, normalizePath, sanitizeJudgeText, scanTexts } from '@ghost-run/core';
import { SELF_PROTECT_NOTICE, createSelfProtect } from './self-protect.mjs';

/** Fixed floor notices (Requirement 6, criteria 4 and 7). */
export const TOO_LARGE_NOTICE = 'delete target too large to enumerate.';
export const HIDDEN_TEXT_NOTICE = 'step 0: hidden text in new content for a Kiro file.';
export const OUTSIDE_NOTICE = 'step 0: write target outside the workspace.';
export const NOT_JUDGED_NOTICE = 'step 0: write call not recognized by the gate.';

/** Most entries below a deleted directory that are enumerated. */
export const MAX_DELETE_ENTRIES = 10_000;

/**
 * @typedef {{
 *   isSymbolicLink(): boolean,
 *   isDirectory(): boolean,
 *   size: number,
 * }} StatLike
 * @typedef {{
 *   lstat(p: string): Promise<StatLike | null>,
 *   realpath(p: string): Promise<string | null>,
 *   readdir(p: string): Promise<string[]>,
 * }} FsView
 * @typedef {{
 *   root: string,
 *   wardSet: import('@ghost-run/core').WardSet,
 *   toolName: string,
 *   wardsFile?: string | null,
 * }} WriteContext
 * @typedef {'pass' | 'warn' | 'block'} Verdict
 * @typedef {{
 *   verdict: Verdict,
 *   report: import('@ghost-run/core').GhostReport<unknown> | null,
 *   wardVerdict: import('@ghost-run/core').WardVerdict | null,
 *   changes: import('@ghost-run/core').Change[],
 *   notices: string[],
 *   floors: Verdict,
 * }} WriteJudgment
 */

const RANK = { pass: 0, warn: 1, block: 2 };

/**
 * Real, read-only adapter over node:fs/promises.
 * @returns {FsView}
 */
export function createNodeFsView() {
  /** @param {unknown} e */
  const missing = (e) => {
    const code = /** @type {{ code?: unknown }} */ (e)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
  };
  return {
    async lstat(p) {
      try {
        return await lstat(p);
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    async realpath(p) {
      try {
        return await realpath(p);
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    readdir: (p) => readdir(p),
  };
}

/**
 * @param {string} root
 * @param {string} abs
 * @returns {{ rel: string, outside: boolean }}
 */
function relativeTo(root, abs) {
  const raw = nodePath.relative(root, abs);
  if (nodePath.isAbsolute(raw)) return { rel: raw, outside: true };
  const rel = normalizePath(raw.split(nodePath.sep).join('/'));
  return { rel, outside: rel === '..' || rel.startsWith('../') };
}

/**
 * Real path of the target, or of its nearest existing parent joined with the missing tail.
 * @param {FsView} fs
 * @param {string} abs
 * @returns {Promise<string>}
 */
async function realOf(fs, abs) {
  let current = abs;
  /** @type {string[]} */
  const tail = [];
  for (;;) {
    const real = await fs.realpath(current);
    if (real !== null) return tail.length === 0 ? real : nodePath.join(real, ...tail);
    const parent = nodePath.dirname(current);
    if (parent === current) return abs;
    tail.unshift(nodePath.basename(current));
    current = parent;
  }
}

/**
 * Breadth-first listing of the entries below a directory, at most `limit`.
 * @param {FsView} fs
 * @param {string} dirAbs
 * @param {number} limit
 * @returns {Promise<{ entries: string[], truncated: boolean }>} paths relative to dirAbs
 */
async function walk(fs, dirAbs, limit) {
  /** @type {string[]} */
  const entries = [];
  /** @type {string[]} */
  let queue = [''];
  while (queue.length > 0) {
    /** @type {string[]} */
    const next = [];
    for (const rel of queue) {
      const names = await fs.readdir(rel === '' ? dirAbs : nodePath.join(dirAbs, rel));
      for (const name of names) {
        if (entries.length >= limit) return { entries, truncated: true };
        const childRel = rel === '' ? name : `${rel}/${name}`;
        entries.push(childRel);
        const st = await fs.lstat(nodePath.join(dirAbs, childRel));
        if (st !== null && st.isDirectory() && !st.isSymbolicLink()) next.push(childRel);
      }
    }
    queue = next;
  }
  return { entries, truncated: false };
}

/**
 * @param {Verdict} a
 * @param {Verdict} b
 * @returns {Verdict}
 */
function max(a, b) {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Judge a write or delete tool call by its target paths. Strictest verdict wins.
 * @param {import('../event.mjs').Classification} classified
 * @param {WriteContext} ctx
 * @param {FsView} fsView
 * @returns {Promise<WriteJudgment>}
 */
export async function judgeWrite(classified, ctx, fsView) {
  if (classified.class === 'read-only') {
    return { verdict: 'pass', report: null, wardVerdict: null, changes: [], notices: [], floors: 'pass' };
  }
  if (classified.class !== 'write' || classified.targets.length === 0) {
    return {
      verdict: 'block',
      report: null,
      wardVerdict: null,
      changes: [],
      notices: [NOT_JUDGED_NOTICE],
      floors: 'block',
    };
  }

  const root = nodePath.resolve(ctx.root);
  const realRoot = (await fsView.realpath(root)) ?? root;
  const isDelete = ctx.toolName === 'delete_file';
  const textBytes = classified.texts.reduce((n, t) => n + Buffer.byteLength(t, 'utf8'), 0);

  /** @type {string[]} */
  const notices = [];
  /** @type {import('@ghost-run/core').Change[]} */
  const changes = [];
  /** @type {import('@ghost-run/core').Effect[]} */
  const effects = [];
  /** @type {Verdict} */
  let floors = 'pass';
  /** @param {string} notice */
  const floor = (notice) => {
    floors = max(floors, 'warn');
    if (!notices.includes(notice)) notices.push(notice);
  };

  /** @type {string | null} */
  let wardsRel = null;
  if (typeof ctx.wardsFile === 'string' && ctx.wardsFile !== '') {
    const r = relativeTo(root, nodePath.resolve(root, ctx.wardsFile));
    if (!r.outside) wardsRel = r.rel;
  }
  const selfProtect = createSelfProtect(wardsRel);

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Set<string>} */
  const kiroTargets = new Set();

  for (const target of classified.targets) {
    const abs = nodePath.resolve(root, target);
    const lexical = relativeTo(root, abs);
    if (lexical.outside) {
      effects.push({ kind: 'file-write', destination: sanitizeJudgeText(target) });
      floor(OUTSIDE_NOTICE);
      continue;
    }
    const realAbs = await realOf(fsView, abs);
    const real = relativeTo(realRoot, realAbs);
    if (real.outside) {
      effects.push({ kind: 'file-write', destination: sanitizeJudgeText(target) });
      floor(OUTSIDE_NOTICE);
      continue;
    }

    const st = await fsView.lstat(abs);
    /** @type {Array<{ rel: string, abs: string }>} */
    const variants = [{ rel: lexical.rel, abs }];
    if (real.rel !== lexical.rel) {
      variants.push({ rel: real.rel, abs: nodePath.join(realRoot, real.rel) });
    }

    /** @param {string} kind @param {string} rel @param {Record<string, unknown>} [extra] */
    const add = (kind, rel, extra = {}) => {
      const key = `${kind}\u0000${rel}`;
      if (seen.has(key)) return;
      seen.add(key);
      changes.push({ kind, path: rel, ...extra });
    };

    if (isDelete) {
      for (const v of variants) {
        add('file-deleted', v.rel);
        if (st !== null && st.isDirectory() && !st.isSymbolicLink() && v === variants[0]) {
          const { entries, truncated } = await walk(fsView, v.abs, MAX_DELETE_ENTRIES);
          if (truncated) floor(TOO_LARGE_NOTICE);
          for (const e of entries) {
            for (const w of variants) add('file-deleted', w.rel === '' ? e : `${w.rel}/${e}`);
          }
        }
      }
    } else if (st === null && lexical.rel === real.rel) {
      add('file-created', lexical.rel);
    } else {
      // Existing entry (or a missing path behind a symbolic link): the write
      // lands on the real path, so both spellings are judged as overwritten.
      const extra =
        st !== null && !st.isSymbolicLink() && !st.isDirectory()
          ? { sizeBefore: st.size, sizeAfter: textBytes }
          : {};
      if (st === null) {
        add('file-created', lexical.rel);
        if (real.rel !== lexical.rel) add('file-created', real.rel);
      } else {
        for (const v of variants) add('file-overwritten', v.rel, extra);
      }
    }

    for (const v of variants) {
      if (foldPath(v.rel).startsWith('.kiro/')) kiroTargets.add(target);
    }
  }

  if (selfProtect.selfProtectedChanges(changes).length > 0) floor(SELF_PROTECT_NOTICE);

  if (kiroTargets.size > 0 && classified.texts.length > 0) {
    for (const target of kiroTargets) {
      const inputs = classified.texts.map((text) => ({ path: target, text }));
      const scan = scanTexts(inputs, { markdown: 'by-extension' });
      if (scan.outcome !== 'clean') {
        floor(HIDDEN_TEXT_NOTICE);
        break;
      }
    }
  }

  /** @type {import('@ghost-run/core').GhostReport<unknown>} */
  const report = {
    snapshots: [],
    changes: [changes],
    effectsOutside: [effects],
    observedEvents: [],
    variantResults: [],
  };
  const wardVerdict = WardEngine.evaluate(report, ctx.wardSet);
  return {
    verdict: max(wardVerdict.verdict, floors),
    report,
    wardVerdict,
    changes,
    notices,
    floors,
  };
}
