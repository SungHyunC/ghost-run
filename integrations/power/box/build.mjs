#!/usr/bin/env node
// Builds the Ghost Run+ box image locally. Run explicitly; the hook path never builds.
// Image tag: ghost-run/box:<sha256 of Dockerfile + BASE_DIGEST + recorder/*>. Never pushes.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const boxDir = dirname(fileURLToPath(import.meta.url));
const recorderDir = join(boxDir, 'recorder');

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

export function computeBoxHash() {
  const h = createHash('sha256');
  const add = (label, buf) => {
    h.update(`${label}\0${buf.length}\0`);
    h.update(buf);
    h.update('\0');
  };
  add('Dockerfile', readFileSync(join(boxDir, 'Dockerfile')));
  add('BASE_DIGEST', readFileSync(join(boxDir, 'BASE_DIGEST')));
  for (const f of listFiles(recorderDir)) {
    if (f.endsWith('.gitkeep')) continue;
    add(`recorder/${relative(recorderDir, f).split('\\').join('/')}`, readFileSync(f));
  }
  return h.digest('hex');
}

function docker(args, inherit = false) {
  return spawnSync('docker', args, { encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
}

function main() {
  const baseDigest = readFileSync(join(boxDir, 'BASE_DIGEST'), 'utf8').trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(baseDigest)) throw new Error('box/BASE_DIGEST is not a sha256 digest');
  if (!readFileSync(join(boxDir, 'Dockerfile'), 'utf8').includes(`@${baseDigest}`)) {
    throw new Error('box/Dockerfile base is not pinned to box/BASE_DIGEST');
  }
  const hash = computeBoxHash();
  const tag = `ghost-run/box:${hash}`;

  // Stage a minimal build context so an absent recorder dir does not fail COPY.
  const ctx = mkdtempSync(join(tmpdir(), 'ghost-box-ctx-'));
  try {
    cpSync(join(boxDir, 'Dockerfile'), join(ctx, 'Dockerfile'));
    mkdirSync(join(ctx, 'recorder'));
    if (existsSync(recorderDir)) cpSync(recorderDir, join(ctx, 'recorder'), { recursive: true });
    const r = docker(
      ['build', '--build-arg', `GHOST_BOX_HASH=${hash}`, '--label', `ghost-run.box.hash=${hash}`, '-t', tag, ctx],
      true,
    );
    if (r.status !== 0) process.exit(r.status ?? 1);
  } finally {
    rmSync(ctx, { recursive: true, force: true });
  }
  const info = docker(['image', 'inspect', tag, '--format', '{{.Id}} {{.Size}} {{index .Config.Labels "ghost-run.box.hash"}}']);
  console.log(`built ${tag}\n${info.stdout.trim()}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
