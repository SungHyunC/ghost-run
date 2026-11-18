// Chrome harness (task 17.1, design D17). No dependency beyond Vite (already a dev dependency) and Node built-ins:
//   1. record `Chrome --version` (a run outside Chrome 157 is additional evidence only and edits no file),
//   2. build the harness page with Vite into a temporary folder,
//   3. serve it with node:http (localhost, random port),
//   4. start the installed Chrome headless (--headless=new) from the command line, once per page load,
//   5. receive the JSON result by POST to /result.
// Real time is measured; --virtual-time-budget is never used.
// Usage (from apps/ghost-hand): node tests/browser/run-chrome.mjs [--out result.json] [--frame-only]
//   --frame-only (task 17.3): only the 3D overlay frame-time page (8 and 20 ghost arms); no hash, property, or timing checks.
//   CHROME_BIN overrides the Chrome executable path.
// Exit code 0: every check passed; 1: a check failed; 2: the harness could not run (record `harness: failed`).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareHashes, goldenPath, nodeHashes, readGolden } from './cross-env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', '..');
const harnessRoot = join(here, 'harness');
const READY_LOADS = 3;
const READY_TIMEOUT_MS = 90_000;
const FULL_TIMEOUT_MS = 20 * 60_000;
const TARGETS = { readyMs: 3000, ghostRun8Ms: 2000, ghostRun20Ms: 5000 };

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex > 0 ? process.argv[outIndex + 1] : undefined;

const frameOnly = process.argv.includes('--frame-only');

const cleanups = [];
let cleaning = false;
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  for (const fn of cleanups.splice(0).reverse()) {
    try {
      fn();
    } catch {
      // best effort
    }
  }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

const progress = (text) => process.stderr.write(`[run-chrome] ${text}\n`);

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

function load() {
  return os.loadavg().map((n) => Number(n.toFixed(2)));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };

async function buildHarness(outDir) {
  const { build } = await import('vite');
  await build({
    root: harnessRoot,
    configFile: false,
    logLevel: 'warn',
    base: './',
    build: { outDir, emptyOutDir: true, target: 'es2022', sourcemap: false, assetsInlineLimit: 0, modulePreload: { polyfill: false } },
    worker: { format: 'es' },
  });
}

/** Serves `dir`; each POST to /result resolves the pending `waitResult`. */
function startServer(dir) {
  let resolveResult;
  let pending = new Promise((r) => (resolveResult = r));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'POST' && (url.pathname === '/result' || url.pathname === '/log')) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(204).end();
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (url.pathname === '/log') progress(`page: ${body.text}`);
          else resolveResult(body);
        } catch (error) {
          progress(`bad POST body: ${error.message}`);
        }
      });
      return;
    }
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '') || 'index.html';
    const file = join(dir, rel);
    if (!file.startsWith(dir + sep) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, 'localhost', () => {
      cleanups.push(() => server.close());
      resolve({
        port: server.address().port,
        nextResult: () => {
          pending = new Promise((r) => (resolveResult = r));
          return pending;
        },
      });
    });
  });
}

/** One Chrome process, one page load; resolves with the posted JSON or rejects on timeout or early exit. */
async function runPage(chrome, profileDir, url, timeoutMs, resultPromise) {
  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      '--remote-debugging-port=0',
      url,
    ],
    { stdio: 'ignore', detached: true },
  );
  const kill = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  };
  cleanups.push(kill);
  let timer;
  let spawnError;
  const exited = new Promise((_, reject) => {
    child.on('error', (e) => reject(new Error(`could not start Chrome: ${e.message}`)));
    child.on('exit', (code, signal) => reject(new Error(`Chrome exited early (code ${code}, signal ${signal})`)));
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no result within ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([resultPromise, exited, timeout]);
  } catch (error) {
    spawnError = error;
    throw error;
  } finally {
    clearTimeout(timer);
    child.removeAllListeners('exit');
    kill();
    void spawnError;
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const report = { harness: 'ok', startedAt: new Date().toISOString(), machine: undefined, loadStart: load() };
  const chrome = findChrome();
  if (chrome === undefined) throw new Error('no Chrome executable found (set CHROME_BIN)');
  const versionRun = spawnSync(chrome, ['--version'], { encoding: 'utf8' });
  const versionText = (versionRun.stdout ?? '').trim();
  const match = /(\d+)\.(\d+\.\d+\.\d+)/.exec(versionText);
  if (versionRun.status !== 0 || match === null) throw new Error(`could not read the Chrome version: ${versionText || versionRun.stderr}`);
  report.chromeVersionText = versionText;
  report.chromeVersion = `${match[1]}.${match[2]}`;
  report.chromeMajor = Number(match[1]);
  report.testedEnvironment = report.chromeMajor === 157;
  progress(`${versionText}${report.testedEnvironment ? '' : ' (not Chrome 157: additional evidence only, no Tested_Environments claim)'}`);

  const tmp = mkdtempSync(join(os.tmpdir(), 'ghost-chrome-'));
  cleanups.push(() => rmSync(tmp, { recursive: true, force: true }));
  const distDir = join(tmp, 'dist');
  const profileDir = join(tmp, 'profile');

  progress('building the harness page');
  await buildHarness(distDir);
  const server = await startServer(distDir);
  const base = `http://localhost:${server.port}/index.html`;

  if (frameOnly) {
    const frame = await runPage(chrome, profileDir, `${base}?mode=frame`, READY_TIMEOUT_MS * 2, server.nextResult());
    if (frame.fatal !== undefined) throw new Error(`frame page failed: ${frame.fatal}`);
    report.frame = frame;
    report.loadEnd = load();
    report.finishedAt = new Date().toISOString();
    report.suitePassed = frame.overlay8?.ok === true && frame.overlay20?.ok === true;
    return report;
  }

  // Page ready time: first load fills the HTTP cache of the profile ("warm local static server" for the rest).
  const readyMs = [];
  for (let i = 0; i < READY_LOADS; i += 1) {
    const result = await runPage(chrome, profileDir, `${base}?mode=ready&n=${i}`, READY_TIMEOUT_MS, server.nextResult());
    if (result.fatal !== undefined) throw new Error(`ready page failed: ${result.fatal}`);
    readyMs.push(result.readyMs);
    progress(`ready load ${i + 1}: ${Math.round(result.readyMs)} ms`);
  }
  report.ready = { loadsMs: readyMs, coldMs: readyMs[0], warmMedianMs: median(readyMs.slice(1)), targetMs: TARGETS.readyMs };

  progress('running the full checks (this takes a few minutes)');
  const full = await runPage(chrome, profileDir, `${base}?mode=full`, FULL_TIMEOUT_MS, server.nextResult());
  if (full.fatal !== undefined) throw new Error(`full page failed: ${full.fatal}`);
  Object.assign(report, { page: full });

  // Cross-environment hash check.
  const golden = readGolden();
  const node = nodeHashes();
  report.hashes = compareHashes({
    golden: golden.hash,
    node: node.hashes,
    chromeMain: full.mainThreadHashes?.hashes,
    chromeWorker: full.workerHashes?.hashes,
  });
  report.nodeVersion = node.node;
  const hashesEqual = report.hashes.allEqual;

  // recordedWith.chrome only after Chrome reproduced the hash in both contexts, and only for Chrome 157.
  const chromeHashesEqual = report.hashes.verdicts.chromeMain && report.hashes.verdicts.chromeWorker;
  report.goldenChromeRecorded = false;
  if (chromeHashesEqual && report.testedEnvironment) {
    const current = readGolden();
    if (current.hash !== golden.hash) throw new Error('golden.json changed during the run');
    if (current.recordedWith.chrome === undefined) {
      const recordedWith = { node: current.recordedWith.node, chrome: report.chromeVersion, machine: current.recordedWith.machine };
      writeFileSync(goldenPath, `${JSON.stringify({ ...current, recordedWith }, null, 2)}\n`);
      report.goldenChromeRecorded = true;
    } else {
      report.goldenChromeRecorded = `already recorded: ${current.recordedWith.chrome}`;
    }
  }

  const p = full;
  const ok = (c) => c !== undefined && c.ok === true;
  report.summary = {
    hashesEqual,
    property5: ok(p.property5),
    property10: ok(p.property10),
    readyWithinTarget: report.ready.warmMedianMs <= TARGETS.readyMs,
    ghostRun8: ok(p.ghostRun8) ? { medianMs: p.ghostRun8.medianMs, firstMs: p.ghostRun8.firstMs, withinTarget: p.ghostRun8.medianMs <= TARGETS.ghostRun8Ms } : false,
    ghostRun20: ok(p.ghostRun20) ? { medianMs: p.ghostRun20.medianMs, firstMs: p.ghostRun20.firstMs, withinTarget: p.ghostRun20.medianMs <= TARGETS.ghostRun20Ms } : false,
    heapEqual: ok(p.memory) ? p.memory.heapEqual && p.memory.jobHeapEqual : false,
  };
  report.loadEnd = load();
  report.finishedAt = new Date().toISOString();
  // A differing hash, a failed property, or an unequal heap fails the suite. Timing targets are reported, not enforced here.
  report.suitePassed = hashesEqual && report.summary.property5 && report.summary.property10 && report.summary.heapEqual;
  return report;
}

try {
  const report = await main();
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (outFile !== undefined) writeFileSync(outFile, text);
  process.stdout.write(text);
  cleanup();
  process.exit(report.suitePassed ? 0 : 1);
} catch (error) {
  const failure = { harness: 'failed', reason: error instanceof Error ? error.message : String(error) };
  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  cleanup();
  process.exit(2);
}
