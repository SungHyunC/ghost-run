#!/usr/bin/env node
// ghost-count -- <absolute path>...
//
// Prints one JSON object { "<path>": { "<table>": <rows> } | "unreadable", ... }.
// Each database is duplicated with its -wal and -shm sidecars into a fresh directory under
// /tmp and counted there with `sqlite3 -readonly -json`, so nothing under /work is ever
// written and a hostile file is only parsed inside the box.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const SQLITE = process.env.GHOST_SQLITE3 || 'sqlite3';
const BATCH = 100; // stays under SQLite's compound SELECT limit
const TIMEOUT_MS = 10_000;

export const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;
const quoteLiteral = (s) => `'${s.replaceAll("'", "''")}'`;

function sqlite(db, sql) {
  const out = execFileSync(SQLITE, ['-readonly', '-json', db, sql], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const text = out.trim();
  return text === '' ? [] : JSON.parse(text);
}

function countTables(db) {
  const tables = sqlite(
    db,
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name",
  ).map((r) => r.name);
  const counts = {};
  for (let i = 0; i < tables.length; i += BATCH) {
    const batch = tables.slice(i, i + BATCH);
    const sql = batch
      .map((t) => `SELECT ${quoteLiteral(t)} AS t, count(*) AS n FROM ${quoteIdent(t)}`)
      .join(' UNION ALL ');
    for (const row of sqlite(db, sql)) {
      if (!Number.isSafeInteger(row.n) || row.n < 0) throw new Error('bad count');
      counts[row.t] = row.n;
    }
  }
  return counts;
}

function countFile(path) {
  if (!isAbsolute(path)) return 'unreadable';
  let tmp;
  try {
    if (!lstatSync(path).isFile()) return 'unreadable'; // no links, devices, directories
    tmp = mkdtempSync(join(tmpdir(), 'ghost-count-'));
    const db = join(tmp, 'db');
    copyFileSync(path, db);
    for (const suffix of ['-wal', '-shm']) {
      const side = path + suffix;
      try {
        if (existsSync(side) && lstatSync(side).isFile()) copyFileSync(side, db + suffix);
      } catch {
        // a missing or unreadable sidecar is treated like an absent one
      }
    }
    return countTables(db);
  } catch {
    return 'unreadable';
  } finally {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
  }
}

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const paths = sep >= 0 ? argv.slice(sep + 1) : argv;
const result = {};
for (const p of paths) result[p] = countFile(p);
process.stdout.write(`${JSON.stringify(result)}\n`);
