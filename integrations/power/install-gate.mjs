#!/usr/bin/env node
// Installs the enforcing Ghost Run+ gate into an existing project. No dependencies; Node 20+.
//
//   node <this folder>/install-gate.mjs [--project <dir>] [--force] [--uninstall]
//
// Install copies the gate bundle (`gate/`) and the box sources (`box/`) of this folder into
// `<project>/.kiro/ghost-run/`, writes the two hook files `.kiro/hooks/ghost-gate.json` and
// `.kiro/hooks/docker-warmup.json` (enabled), a default `wards.yaml` when the project has no wards file, and adds
// `.ghost-run/` to `.gitignore`. Everything it writes is listed in `.kiro/ghost-run/manifest.json`.
// `--uninstall` removes exactly the files of that manifest. No existing file is overwritten without `--force`.
import { createHash } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync,
  statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE_SOURCE = join(HERE, 'gate');
const BOX_SOURCE = join(HERE, 'box');

/** Folder inside the project that holds the copied gate, the box sources, and the manifest. */
export const INSTALL_DIR = '.kiro/ghost-run';
export const MANIFEST_PATH = `${INSTALL_DIR}/manifest.json`;
export const GATE_COMMAND = `node ${INSTALL_DIR}/gate/ghost-gate.mjs`;
export const WARMUP_COMMAND = `node ${INSTALL_DIR}/gate/docker-warmup.mjs`;
export const GITIGNORE_LINE = '.ghost-run/';

/** Same content as `apps/ghost-shell/wards.yaml`, plus a commented `trusted_commands` example. */
export const DEFAULT_WARDS_YAML = `# Ghost Run+ wards. The gate rehearses each shell command in a sealed copy and judges it with these wards.
# Change them to fit this project. A wards file that does not parse makes the gate ask before every call.
wards:
  - id: protect-data
    kind: path
    deny: [delete, overwrite]
    paths: ["data/**", "db/*.sqlite", ".env"]
  - id: no-data-loss
    kind: sql
    tables: [users, orders]
    max_rows_lost: 0
  - id: no-secret-egress
    kind: egress
    secrets: [".env", "**/*.pem"]
    allow_hosts: [registry.npmjs.org]
safe_commands: [ls, pwd, cat, "git status", "git diff"]
# Trusted commands pass without a rehearsal. Only list commands whose scripts, tests, and config files your
# team reviews: the gate does not look at what a listed command runs. A \`*\` matches one word that does not
# start with \`-\`; a final \`**\` matches zero or more words.
# trusted_commands: ["npm test", "npm run lint", "npx vitest run **"]
`;

const WARDS_FILE = 'wards.yaml';
const FALLBACK_WARDS_FILE = 'apps/ghost-shell/wards.yaml';

/** @param {Buffer | string} data */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
/** @param {string} p */
const posix = (p) => p.split(sep).join('/');

/** Hook file content: the same shape as `.kiro/hooks/ghost-gate.json` of the template, enabled. */
function hookFiles() {
  const offHint = 'Switch off: set "enabled" to false, or run install-gate.mjs --uninstall.';
  /** @param {string} matcher @param {string} tool */
  const gateEntry = (matcher, tool) => ({
    name: `ghost-gate (${matcher})`,
    description: `Rehearses ${tool} in a sealed copy before they run. ${offHint}`,
    trigger: 'PreToolUse',
    matcher,
    action: { type: 'command', command: GATE_COMMAND },
    timeout: 60,
    enabled: true,
  });
  return {
    '.kiro/hooks/ghost-gate.json': {
      version: 'v1',
      hooks: [gateEntry('shell', 'shell commands'), { ...gateEntry('write', 'file writes'), description: `Judges file writes against the wards before they happen. ${offHint}` }],
    },
    '.kiro/hooks/docker-warmup.json': {
      version: 'v1',
      hooks: [
        {
          name: 'docker-warmup (shell)',
          description: `Wakes Docker Desktop in the background before the gate's first check. Never blocks, prints nothing. ${offHint}`,
          trigger: 'PreToolUse',
          matcher: 'shell',
          action: { type: 'command', command: WARMUP_COMMAND },
          timeout: 5,
          enabled: true,
        },
      ],
    },
  };
}

/**
 * @param {string} dir
 * @returns {string[]} files below dir (relative, sorted), without local-only `*.local` files
 */
function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} d */
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (name.endsWith('.local')) continue;
      if (statSync(full).isDirectory()) walk(full);
      else out.push(posix(relative(dir, full)));
    }
  };
  walk(dir);
  return out;
}

/** @param {string} abs */
function existsAny(abs) {
  try {
    lstatSync(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {{ path: string, sha256: string }} ManifestFile
 * @typedef {{ version: 1, files: ManifestFile[], createdDirs: string[], gitignore: { created: boolean, added: boolean } }} Manifest
 */

/**
 * A manifest path is a project-relative path under `.kiro/` or the wards file; anything else is refused, so a
 * tampered manifest cannot make `--uninstall` remove files elsewhere.
 * @param {unknown} p
 * @returns {p is string}
 */
function safeManifestPath(p) {
  if (typeof p !== 'string' || p === '' || p.includes('\0') || p.includes('\\') || p.startsWith('/')) return false;
  if (p.split('/').some((part) => part === '..' || part === '.' || part === '')) return false;
  return p.startsWith('.kiro/') || p === WARDS_FILE;
}

/**
 * @param {string} root
 * @returns {Manifest | { error: string } | null} null when there is no manifest
 */
function readManifest(root) {
  const file = join(root, MANIFEST_PATH);
  if (!existsAny(file)) return null;
  try {
    const m = JSON.parse(readFileSync(file, 'utf8'));
    const files = Array.isArray(m.files) ? m.files : null;
    const dirs = Array.isArray(m.createdDirs) ? m.createdDirs : null;
    if (m.version !== 1 || !files || !dirs) return { error: 'unknown manifest format' };
    if (!files.every((/** @type {any} */ f) => f && safeManifestPath(f.path) && typeof f.sha256 === 'string')) {
      return { error: 'the manifest lists a path outside .kiro/ and wards.yaml' };
    }
    if (!dirs.every((/** @type {unknown} */ d) => d === '.kiro' || safeManifestPath(d))) return { error: 'the manifest lists a folder outside .kiro/' };
    const g = m.gitignore && typeof m.gitignore === 'object' ? m.gitignore : {};
    return { version: 1, files, createdDirs: dirs, gitignore: { created: g.created === true, added: g.added === true } };
  } catch {
    return { error: 'the manifest is not valid JSON' };
  }
}

/** @param {string} root @param {string} rel */
function ensureDir(root, rel, /** @type {Set<string>} */ created) {
  const parts = rel.split('/');
  let cur = '';
  for (const part of parts) {
    cur = cur === '' ? part : `${cur}/${part}`;
    const abs = join(root, cur);
    if (!existsAny(abs)) {
      mkdirSync(abs);
      created.add(cur);
    }
  }
}

/**
 * Remove the folders this install created, deepest first, only when they are empty.
 * @param {string} root
 * @param {string[]} dirs
 */
function removeEmptyDirs(root, dirs) {
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    try {
      rmdirSync(join(root, d));
    } catch {
      // not empty or already gone: left as it is
    }
  }
}

/**
 * @typedef {{ project: string, force: boolean, uninstall: boolean, help: boolean }} Options
 * @param {string[]} argv
 * @returns {Options | { error: string }}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const o = { project: process.cwd(), force: false, uninstall: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--uninstall') o.uninstall = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--project') {
      const v = argv[++i];
      if (v === undefined || v === '' || v.startsWith('--')) return { error: '--project needs a folder' };
      o.project = v;
    } else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const USAGE = `Usage: node install-gate.mjs [--project <dir>] [--force] [--uninstall]

Installs the enforcing Ghost Run+ gate into a project (default: the current folder).
  --project <dir>  the project to install into
  --force          overwrite files this installer wrote before or that already exist
  --uninstall      remove exactly the files listed in <project>/${MANIFEST_PATH}
`;

/**
 * @param {string[]} argv
 * @param {{ out: (s: string) => void, err: (s: string) => void }} [io]
 * @returns {number} the exit code
 */
export function main(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }) {
  const o = parseArgs(argv);
  if ('error' in o) {
    io.err(`install-gate: ${o.error}\n\n${USAGE}`);
    return 1;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (Number(process.versions.node.split('.')[0]) < 20) {
    io.err('install-gate: Node 20 or later is required.\n');
    return 1;
  }
  /** @type {string} */
  let root;
  try {
    root = realpathSync(resolve(o.project));
    if (!statSync(root).isDirectory()) throw new Error('not a folder');
  } catch {
    io.err(`install-gate: the project folder does not exist: ${o.project}\n`);
    return 1;
  }
  // The template repository carries its own committed hook files and a gate that runs from source.
  if (existsSync(join(root, 'integrations', 'power', 'install-gate.mjs')) && realpathSync(join(root, 'integrations', 'power')) === realpathSync(HERE)) {
    io.err('install-gate: refusing to install into the Ghost Run+ repository that holds this installer. Use `corepack pnpm gate:on` there.\n');
    return 1;
  }
  return o.uninstall ? uninstall(root, o, io) : install(root, o, io);
}

/**
 * @param {string} root @param {Options} o @param {{ out: (s: string) => void, err: (s: string) => void }} io
 * @returns {number}
 */
function install(root, o, io) {
  if (!existsSync(join(GATE_SOURCE, 'ghost-gate.mjs')) || !existsSync(join(BOX_SOURCE, 'Dockerfile'))) {
    io.err('install-gate: the gate bundle or the box sources are missing next to this installer.\n');
    return 1;
  }
  const previous = readManifest(root);
  if (previous !== null && 'error' in previous) {
    io.err(`install-gate: ${MANIFEST_PATH}: ${previous.error}. Nothing was changed.\n`);
    return 1;
  }

  // Plan: every file this install writes, as project-relative path -> content.
  /** @type {Map<string, { data: Buffer, mode?: number }>} */
  const plan = new Map();
  for (const name of listFiles(GATE_SOURCE)) plan.set(`${INSTALL_DIR}/gate/${name}`, { data: readFileSync(join(GATE_SOURCE, name)) });
  for (const name of listFiles(BOX_SOURCE)) {
    plan.set(`${INSTALL_DIR}/box/${name}`, { data: readFileSync(join(BOX_SOURCE, name)), mode: statSync(join(BOX_SOURCE, name)).mode & 0o777 });
  }
  for (const [rel, json] of Object.entries(hookFiles())) plan.set(rel, { data: Buffer.from(`${JSON.stringify(json, null, 2)}\n`) });

  // wards.yaml: written only when the project has no wards file. A file this installer wrote earlier stays ours.
  const ownedWards = previous?.files.some((f) => f.path === WARDS_FILE) === true && existsAny(join(root, WARDS_FILE));
  const hasWards = existsAny(join(root, WARDS_FILE)) || existsAny(join(root, FALLBACK_WARDS_FILE));
  const writeWards = !hasWards;

  const conflicts = [];
  if (previous !== null) conflicts.push(MANIFEST_PATH);
  for (const rel of plan.keys()) if (existsAny(join(root, rel))) conflicts.push(rel);
  if (conflicts.length > 0 && !o.force) {
    io.err(`install-gate: these files already exist; nothing was changed. Use --force to overwrite them:\n${[...new Set(conflicts)].map((c) => `  ${c}`).join('\n')}\n`);
    return 1;
  }
  // A path that exists but is not a plain file (a folder, a link) is never overwritten, even with --force.
  for (const rel of plan.keys()) {
    const abs = join(root, rel);
    if (existsAny(abs) && !lstatSync(abs).isFile()) {
      io.err(`install-gate: ${rel} exists and is not a regular file. Nothing was changed.\n`);
      return 1;
    }
  }

  /** @type {Set<string>} */
  const createdDirs = new Set(previous?.createdDirs ?? []);
  /** @type {ManifestFile[]} */
  const written = [];
  /** @param {string} rel @param {Buffer} data @param {number} [mode] */
  const put = (rel, data, mode) => {
    ensureDir(root, posix(dirname(rel)) === '.' ? '' : posix(dirname(rel)), createdDirs);
    const abs = join(root, rel);
    writeFileSync(abs, data);
    if (mode !== undefined) chmodSync(abs, mode);
    written.push({ path: rel, sha256: sha256(data) });
  };
  for (const [rel, { data, mode }] of plan) put(rel, data, mode);
  if (writeWards) put(WARDS_FILE, Buffer.from(DEFAULT_WARDS_YAML));
  else if (ownedWards) written.push({ path: WARDS_FILE, sha256: previous?.files.find((f) => f.path === WARDS_FILE)?.sha256 ?? sha256(readFileSync(join(root, WARDS_FILE))) });

  // .gitignore
  const gitignorePath = join(root, '.gitignore');
  const hadGitignore = existsAny(gitignorePath);
  const gitignoreText = hadGitignore ? readFileSync(gitignorePath, 'utf8') : '';
  const lines = gitignoreText.split(/\r?\n/).map((l) => l.trim());
  const present = lines.includes(GITIGNORE_LINE) || lines.includes('/.ghost-run/') || lines.includes('.ghost-run');
  let gitignoreAdded = previous?.gitignore.added === true && present;
  let gitignoreCreated = previous?.gitignore.created === true && hadGitignore;
  if (!present) {
    const sep_ = gitignoreText === '' || gitignoreText.endsWith('\n') ? '' : '\n';
    writeFileSync(gitignorePath, `${gitignoreText}${sep_}${GITIGNORE_LINE}\n`);
    gitignoreAdded = true;
    gitignoreCreated = !hadGitignore;
  }

  // Files of an earlier install that this install no longer writes are removed with it.
  const stale = (previous?.files ?? []).filter((f) => f.path !== WARDS_FILE && !plan.has(f.path));
  for (const f of stale) rmSync(join(root, f.path), { force: true });

  /** @type {Manifest} */
  const manifest = {
    version: 1,
    files: written.sort((a, b) => (a.path < b.path ? -1 : 1)),
    createdDirs: [...createdDirs].sort(),
    gitignore: { created: gitignoreCreated, added: gitignoreAdded },
  };
  writeFileSync(join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);

  const self = fileURLToPath(import.meta.url);
  io.out(
    [
      `Ghost Run+ gate installed in ${root}`,
      `  gate and box sources: ${INSTALL_DIR}/ (${written.length} files listed in ${MANIFEST_PATH})`,
      '  hooks (enabled): .kiro/hooks/ghost-gate.json, .kiro/hooks/docker-warmup.json',
      writeWards ? `  wards: wrote ${WARDS_FILE} (default wards; edit it to fit the project)` : `  wards: kept the project's own wards file`,
      present && !gitignoreAdded ? `  .gitignore: already ignores ${GITIGNORE_LINE}` : `  .gitignore: ${GITIGNORE_LINE} added`,
      '',
      'Next steps:',
      `  1. Build the box image once (needs Docker): node ${INSTALL_DIR}/box/build.mjs`,
      '     Without Docker the gate falls back to static analysis (Plan B) and asks before it lets a command run.',
      '  2. Open this folder in Kiro, trust it, and start a new session.',
      '',
      'Switch it off: set "enabled" to false in both entries of .kiro/hooks/ghost-gate.json and in',
      '.kiro/hooks/docker-warmup.json, or remove everything this installer wrote with',
      `  node ${self} --project ${root} --uninstall`,
      '',
    ].join('\n'),
  );
  return 0;
}

/**
 * @param {string} root @param {Options} o @param {{ out: (s: string) => void, err: (s: string) => void }} io
 * @returns {number}
 */
function uninstall(root, o, io) {
  const manifest = readManifest(root);
  if (manifest === null) {
    io.err(`install-gate: ${MANIFEST_PATH} not found; nothing to uninstall.\n`);
    return 1;
  }
  if ('error' in manifest) {
    io.err(`install-gate: ${MANIFEST_PATH}: ${manifest.error}. Nothing was changed.\n`);
    return 1;
  }
  const removed = [];
  const kept = [];
  for (const f of manifest.files) {
    const abs = join(root, f.path);
    if (!existsAny(abs)) continue;
    // A file that is not a plain file or that the user changed after the install stays, unless --force.
    const plain = lstatSync(abs).isFile();
    if (!plain || (!o.force && sha256(readFileSync(abs)) !== f.sha256)) {
      kept.push(f.path);
      continue;
    }
    rmSync(abs);
    removed.push(f.path);
  }
  // .gitignore: take out the line this install added; delete the file only when this install created it and it is empty.
  let gitignoreNote = '';
  const gitignorePath = join(root, '.gitignore');
  if (manifest.gitignore.added && existsAny(gitignorePath) && lstatSync(gitignorePath).isFile()) {
    const text = readFileSync(gitignorePath, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const parts = text.split(/\r?\n/);
    const idx = parts.lastIndexOf(GITIGNORE_LINE);
    if (idx >= 0) {
      parts.splice(idx, 1);
      const next = parts.join(eol);
      if (manifest.gitignore.created && next.trim() === '') rmSync(gitignorePath);
      else writeFileSync(gitignorePath, next);
      gitignoreNote = `  .gitignore: removed the ${GITIGNORE_LINE} line\n`;
    }
  }
  if (kept.length === 0) rmSync(join(root, MANIFEST_PATH), { force: true });
  removeEmptyDirs(root, manifest.createdDirs);
  io.out(
    `Ghost Run+ gate uninstalled from ${root}\n  removed ${removed.length} files\n${gitignoreNote}` +
      (kept.length > 0
        ? `  kept (changed since the install; use --force to remove them):\n${kept.map((k) => `    ${k}`).join('\n')}\n  ${MANIFEST_PATH} was kept so that you can run --uninstall --force.\n`
        : '') +
      `  The graveyard and statistics in ${GITIGNORE_LINE} were not touched.\n`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
