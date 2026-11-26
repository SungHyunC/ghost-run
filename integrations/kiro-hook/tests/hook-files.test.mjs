import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Task 1.7 (human host probe) may change ALLOWED_TRIGGERS and TIMEOUT_PLACEMENT.
// Until then these are the currently documented values.
const ALLOWED_TRIGGERS = [
  'PreToolUse',
  'PostToolUse',
  'PostFileCreate',
  'PostFileSave',
  'PostFileDelete',
  'PermissionRequest',
];
const FILE_TRIGGERS = ['PostFileCreate', 'PostFileSave', 'PostFileDelete'];
// 'entry' = `timeout` sits on the hook entry (1..60 s) and never inside `action`.
const TIMEOUT_PLACEMENT = 'entry';
const TIMEOUT_MIN = 1;
const TIMEOUT_MAX = 60;

const COMMAND_RE = /^node integrations\/kiro-hook\/([a-z0-9-]+\.mjs)$/;
const PROBE_ARG_RE = /^--[a-z0-9-]+(=[a-z0-9-]+)?$/;
// The one deliberate placement violation: the probe entry that tests a timeout inside `action`.
const DELIBERATE_ACTION_TIMEOUT_ARG = '--timeout-test=action';
const ABSOLUTE_PATH_RE = /(^|[\s"'=:(])(\/(Users|home|root|tmp|var|etc|opt)\/|[A-Za-z]:\\)/;
// Principle: the repository never contains a real user name, home path, or e-mail address.
// The real name is only obtained at run time and used to scan that no hook file contains it.
const USER_NAMES = [userInfo().username].filter((n) => n.length > 3);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const hooksDir = resolve(repoRoot, '.kiro', 'hooks');
const experimentsDir = resolve(repoRoot, 'integrations', 'kiro-hook', 'experiments');

/**
 * Validate one hook file. Returns a list of error strings (empty = valid).
 * @param {string} fileName
 * @param {string} text
 * @param {(script: string) => boolean} [scriptExists]
 * @returns {string[]}
 */
export function validateHookFile(
  fileName,
  text,
  scriptExists = (s) => existsSync(resolve(repoRoot, 'integrations', 'kiro-hook', s)),
  userNames = USER_NAMES,
) {
  /** @type {string[]} */
  const errors = [];
  /** @type {any} */
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return [`${fileName}: not valid JSON`];
  }
  const isExpB = fileName.startsWith('exp-b-');
  const isProbe = fileName.startsWith('probe-');
  const hooks = doc && Array.isArray(doc.hooks) ? doc.hooks : null;
  if (!hooks) return [`${fileName}: hooks must be an array`];

  if (isExpB) {
    // Exp-b files are exempt from every other check except an explicit boolean `enabled`.
    hooks.forEach((/** @type {any} */ h, /** @type {number} */ i) => {
      if (typeof h?.enabled !== 'boolean') errors.push(`${fileName}[${i}]: enabled must be a boolean`);
    });
    return errors;
  }

  if (doc.version !== 'v1') errors.push(`${fileName}: version must be v1`);
  if (ABSOLUTE_PATH_RE.test(text)) errors.push(`${fileName}: contains an absolute path`);
  for (const u of userNames) {
    if (text.toLowerCase().includes(u.toLowerCase())) errors.push(`${fileName}: contains a user name`);
  }

  hooks.forEach((/** @type {any} */ h, /** @type {number} */ i) => {
    const at = `${fileName}[${i}]`;
    if (typeof h?.name !== 'string' || h.name.trim() === '') errors.push(`${at}: name must be non-empty`);
    if (!ALLOWED_TRIGGERS.includes(h?.trigger)) errors.push(`${at}: trigger not allowed`);
    if (FILE_TRIGGERS.includes(h?.trigger)) {
      if (typeof h.matcher !== 'string') {
        errors.push(`${at}: file trigger needs a matcher`);
      } else {
        try {
          new RegExp(h.matcher);
        } catch {
          errors.push(`${at}: matcher does not compile`);
        }
      }
    }
    if (typeof h?.enabled !== 'boolean') errors.push(`${at}: enabled must be a boolean`);

    const action = h?.action;
    if (action?.type !== 'command') errors.push(`${at}: action.type must be command`);
    const command = typeof action?.command === 'string' ? action.command : '';
    let base = command;
    let arg = null;
    if (isProbe) {
      const parts = command.split(' ');
      if (parts.length > 3) {
        errors.push(`${at}: probe command allows at most one -- argument`);
      } else if (parts.length === 3) {
        base = parts.slice(0, 2).join(' ');
        arg = parts[2];
        if (!PROBE_ARG_RE.test(arg)) errors.push(`${at}: invalid probe argument`);
      }
    }
    const m = COMMAND_RE.exec(base);
    if (!m) errors.push(`${at}: command does not match the allowed form`);
    else if (!scriptExists(m[1])) errors.push(`${at}: script ${m[1]} does not exist`);

    // Probe exemption: only the deliberate --timeout-test=action entry skips the placement check.
    const exempt = isProbe && arg === DELIBERATE_ACTION_TIMEOUT_ARG;
    if (!exempt && TIMEOUT_PLACEMENT === 'entry') {
      const t = h?.timeout;
      if (!Number.isInteger(t) || t < TIMEOUT_MIN || t > TIMEOUT_MAX) {
        errors.push(`${at}: entry-level timeout must be an integer ${TIMEOUT_MIN}..${TIMEOUT_MAX}`);
      }
      if (action && 'timeout' in action) errors.push(`${at}: timeout must not be inside action`);
    }
  });
  return errors;
}

/**
 * ghost-gate.json rules. Returns a list of error strings.
 * @param {unknown} doc
 * @returns {string[]}
 */
export function validateGhostGate(doc) {
  /** @type {string[]} */
  const errors = [];
  const d = /** @type {any} */ (doc);
  /** @type {any[]} */
  const hooks = d && Array.isArray(d.hooks) ? d.hooks : [];
  const matchers = hooks.map((h) => h?.matcher);
  if (hooks.length !== 2 || !matchers.includes('shell') || !matchers.includes('write')) {
    errors.push('ghost-gate: matchers must be exactly shell and write');
  }
  if (hooks.some((/** @type {any} */ h) => h?.trigger !== 'PreToolUse')) errors.push('ghost-gate: trigger must be PreToolUse');
  if (matchers.some((/** @type {any} */ m) => typeof m === 'string' && (m.includes('@mcp') || m.includes('@powers')))) {
    errors.push('ghost-gate: matcher must not contain @mcp or @powers');
  }
  if (new Set(hooks.map((/** @type {any} */ h) => h?.action?.command)).size > 1) {
    errors.push('ghost-gate: both entries must use the same command');
  }
  return errors;
}

/**
 * Retirement rule. `files` maps file name to parsed doc.
 * @param {Record<string, any>} files
 * @returns {string[]}
 */
export function retirementViolations(files) {
  const on = (/** @type {any} */ d) => (Array.isArray(d?.hooks) ? d.hooks : []).some((/** @type {any} */ h) => h?.enabled === true);
  if (!on(files['ghost-gate.json'])) return [];
  return Object.keys(files)
    .filter((n) => n.startsWith('exp-b-') && on(files[n]))
    .map((n) => `${n}: enabled while ghost-gate.json is enabled`);
}

const fileNames = readdirSync(hooksDir).filter((n) => n.endsWith('.json'));
const texts = Object.fromEntries(fileNames.map((n) => [n, readFileSync(resolve(hooksDir, n), 'utf8')]));
const docs = Object.fromEntries(fileNames.map((n) => [n, JSON.parse(texts[n])]));

describe('.kiro/hooks files', () => {
  for (const name of fileNames) {
    it(`${name} is a valid hook file`, () => {
      expect(validateHookFile(name, texts[name])).toEqual([]);
    });
  }

  it('contains no hidden Unicode or HTML comment opener', () => {
    const hidden = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]|\uDB40[\uDC00-\uDC7F]/;
    const opener = '<' + '!--';
    for (const name of fileNames) {
      expect(hidden.test(texts[name]), name).toBe(false);
      expect(texts[name].includes(opener), name).toBe(false);
    }
  });

  it('ghost-gate.json (when present) follows the gate rules', () => {
    if (!docs['ghost-gate.json']) return;
    expect(validateGhostGate(docs['ghost-gate.json'])).toEqual([]);
  });
});

describe('ghost-gate.json (task 8.3)', () => {
  const gate = docs['ghost-gate.json'];

  it('exists with version v1 and exactly the two PreToolUse entries', () => {
    expect(gate).toBeDefined();
    expect(gate.version).toBe('v1');
    expect(gate.hooks.map((/** @type {any} */ h) => [h.name, h.matcher, h.trigger])).toEqual([
      ['ghost-gate (shell)', 'shell', 'PreToolUse'],
      ['ghost-gate (write)', 'write', 'PreToolUse'],
    ]);
  });

  it('uses one command, entry-level timeout 60, and ships disabled', () => {
    for (const h of gate.hooks) {
      expect(h.action).toEqual({ type: 'command', command: 'node integrations/kiro-hook/ghost-gate.mjs' });
      expect(h.timeout).toBe(60);
      expect('timeout' in h.action).toBe(false);
      expect(h.enabled).toBe(false);
    }
  });

  it('has no @mcp or @powers matcher', () => {
    for (const h of gate.hooks) expect(h.matcher).not.toMatch(/@mcp|@powers/);
  });
});

describe('ghost-log.json (task 10.3)', () => {
  const log = docs['ghost-log.json'];

  it('exists with version v1 and one PostToolUse entry per category', () => {
    expect(log).toBeDefined();
    expect(log.version).toBe('v1');
    expect(log.hooks.map((/** @type {any} */ h) => [h.trigger, h.matcher])).toEqual([
      ['PostToolUse', 'read'],
      ['PostToolUse', 'web'],
      ['PostToolUse', 'shell'],
      ['PostToolUse', '@mcp'],
    ]);
  });

  it('uses one command, entry-level timeout 10, and ships disabled', () => {
    for (const h of log.hooks) {
      expect(h.action).toEqual({ type: 'command', command: 'node integrations/kiro-hook/ghost-log.mjs' });
      expect(h.timeout).toBe(10);
      expect('timeout' in h.action).toBe(false);
      expect(h.enabled).toBe(false);
    }
  });
});

describe('exp-b retirement', () => {
  it('no exp-b file is enabled while ghost-gate.json is enabled', () => {
    expect(retirementViolations(docs)).toEqual([]);
  });

  it('both exp-b files live in experiments/, stay disabled, and exp-b-gate.mjs still exists', () => {
    for (const name of ['exp-b-block-rm-rf.json', 'exp-b-log-write.json']) {
      const file = resolve(experimentsDir, name);
      expect(existsSync(file), name).toBe(true);
      expect(existsSync(resolve(hooksDir, name)), `${name} must not be in .kiro/hooks`).toBe(false);
      for (const h of JSON.parse(readFileSync(file, 'utf8')).hooks) expect(h.enabled, name).toBe(false);
    }
    expect(existsSync(resolve(repoRoot, 'integrations', 'kiro-hook', 'exp-b-gate.mjs'))).toBe(true);
  });
});

describe('.kiro/hooks holds only the six product hooks (task 28.1)', () => {
  it('has exactly the six product hook files', () => {
    expect([...fileNames].sort()).toEqual([
      'blacklight-steering.json',
      'contract-pbt.json',
      'docker-warmup.json',
      'ghost-gate.json',
      'ghost-log.json',
      'world-scaffold.json',
    ]);
  });
});

describe('hook descriptions (task 28.2)', () => {
  const SWITCHED_BY_SCRIPT = ['ghost-gate.json', 'docker-warmup.json'];
  const GATE_SENTENCE = 'Ships disabled; `corepack pnpm gate:on` switches it on and `corepack pnpm gate:off` switches it off.';
  const PANEL_SENTENCE = "Ships disabled; switch it on in Kiro's hook panel or set `enabled` to true.";

  for (const name of fileNames) {
    it(`${name}: every description ends with the sentence that is true today`, () => {
      const want = SWITCHED_BY_SCRIPT.includes(name) ? GATE_SENTENCE : PANEL_SENTENCE;
      for (const h of docs[name].hooks) {
        expect(h.description, `${name} ${h.name}`).toMatch(/\.$/);
        expect(h.description.endsWith(` ${want}`), `${name} ${h.name}`).toBe(true);
        expect(h.description).not.toMatch(/task \d+\.\d+/);
      }
    });
  }
});

describe('hook file validator self-tests', () => {
  const good = () => ({
    version: 'v1',
    hooks: [
      {
        name: 'ok',
        trigger: 'PostFileSave',
        matcher: '.*',
        action: { type: 'command', command: 'node integrations/kiro-hook/ghost-log.mjs' },
        timeout: 10,
        enabled: true,
      },
    ],
  });
  const check = (/** @type {(d: any, h: any) => unknown} */ mutate, fileName = 'ghost-log.json') => {
    const d = good();
    mutate(d, d.hooks[0]);
    return validateHookFile(fileName, JSON.stringify(d), () => true);
  };

  it('accepts a valid file', () => {
    expect(check(() => {})).toEqual([]);
  });

  /** @type {[string, (d: any, h: any) => unknown][]} */
  const cases = [
    ['bad version', (/** @type {any} */ d) => (d.version = 'v2')],
    ['empty name', (_d, h) => (h.name = ' ')],
    ['unknown trigger', (_d, h) => (h.trigger = 'OnSave')],
    ['missing file matcher', (_d, h) => delete h.matcher],
    ['uncompilable matcher', (_d, h) => (h.matcher = '(')],
    ['non-command action', (_d, h) => (h.action.type = 'agent')],
    ['bad command form', (_d, h) => (h.action.command = 'node ../x.mjs')],
    ['extra argument on non-probe', (_d, h) => (h.action.command += ' --x')],
    ['absolute path', (_d, h) => (h.description = 'see /Users/someone/file')],
    ['non-boolean enabled', (_d, h) => (h.enabled = 'yes')],
    ['timeout 0', (_d, h) => (h.timeout = 0)],
    ['timeout 61', (_d, h) => (h.timeout = 61)],
    ['missing timeout', (_d, h) => delete h.timeout],
    ['timeout inside action', (_d, h) => (h.action.timeout = 5)],
  ];
  for (const [label, mutate] of cases) {
    it(`rejects: ${label}`, () => {
      expect(check(mutate).length).toBeGreaterThan(0);
    });
  }

  it('rejects a user name (fake name, never a real one)', () => {
    const d = /** @type {any} */ (good());
    d.hooks[0].description = 'by example-user';
    const errs = validateHookFile('ghost-log.json', JSON.stringify(d), () => true, ['example-user']);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a missing script', () => {
    const errs = validateHookFile('ghost-log.json', JSON.stringify(good()), () => false);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('probe files may add one -- argument but not two', () => {
    const one = (/** @type {any} */ _d, /** @type {any} */ h) => (h.action.command += ' --deny-test');
    const two = (/** @type {any} */ _d, /** @type {any} */ h) => (h.action.command += ' --a --b');
    expect(check(one, 'probe-x.json')).toEqual([]);
    expect(check(two, 'probe-x.json').length).toBeGreaterThan(0);
  });

  it('exempts only the --timeout-test=action probe entry from placement', () => {
    const deliberate = (/** @type {any} */ _d, /** @type {any} */ h) => {
      h.action.command += ' --timeout-test=action';
      h.action.timeout = 1;
      delete h.timeout;
    };
    const other = (/** @type {any} */ _d, /** @type {any} */ h) => {
      h.action.command += ' --stdout-test';
      h.action.timeout = 1;
      delete h.timeout;
    };
    expect(check(deliberate, 'probe-x.json')).toEqual([]);
    expect(check(other, 'probe-x.json').length).toBeGreaterThan(0);
    expect(check(deliberate, 'ghost-log.json').length).toBeGreaterThan(0);
  });

  it('exp-b files are checked for enabled only', () => {
    const bad = JSON.stringify({ hooks: [{ name: '', action: { timeout: 60 }, enabled: false }] });
    expect(validateHookFile('exp-b-x.json', bad, () => false)).toEqual([]);
    const noEnabled = JSON.stringify({ hooks: [{}] });
    expect(validateHookFile('exp-b-x.json', noEnabled).length).toBe(1);
  });

  it('ghost-gate rules fire', () => {
    const gate = (/** @type {string[]} */ matchers, cmds = ['c', 'c']) => ({
      hooks: matchers.map((/** @type {string} */ m, /** @type {number} */ i) => ({ trigger: 'PreToolUse', matcher: m, action: { command: cmds[i] } })),
    });
    expect(validateGhostGate(gate(['shell', 'write']))).toEqual([]);
    expect(validateGhostGate(gate(['shell'])).length).toBeGreaterThan(0);
    expect(validateGhostGate(gate(['shell', 'shell'])).length).toBeGreaterThan(0);
    expect(validateGhostGate(gate(['shell', 'write|@mcp'])).length).toBeGreaterThan(0);
    expect(validateGhostGate(gate(['shell', '@powers'])).length).toBeGreaterThan(0);
    expect(validateGhostGate(gate(['shell', 'write'], ['a', 'b'])).length).toBeGreaterThan(0);
  });

  it('retirement rule fires only when both are enabled', () => {
    const f = (/** @type {boolean} */ gate, /** @type {boolean} */ expb) => ({
      'ghost-gate.json': { hooks: [{ enabled: gate }] },
      'exp-b-a.json': { hooks: [{ enabled: expb }] },
    });
    expect(retirementViolations(f(true, true)).length).toBe(1);
    expect(retirementViolations(f(true, false))).toEqual([]);
    expect(retirementViolations(f(false, true))).toEqual([]);
    expect(retirementViolations({ 'exp-b-a.json': { hooks: [{ enabled: true }] } })).toEqual([]);
  });
});
