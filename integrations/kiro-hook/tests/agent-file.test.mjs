// Tests for the custom agent file .kiro/agents/world-smith.json (spec world-smith, Requirement 5).
// Reads files only. Hidden characters and the HTML comment opener are built from code points here.
// **Validates: Requirements 1.1, 1.2, 2, 3, 4, 5**
import { existsSync, readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport } from '@ghost-run/core';
import { scanFiles } from '@ghost-run/core/possession-node';
import { describe, expect, it } from 'vitest';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AGENT = '.kiro/agents/world-smith.json';
const SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md'].map((f) => `.kiro/specs/world-smith/${f}`);

const REQUIRED_RESOURCES = [
  '.kiro/specs/_new-world/README.md',
  '.kiro/steering/world-contract.md',
  '.kiro/steering/structure.md',
  '.kiro/steering/security.md',
];
const RULE_ENDINGS = ['test', 'typecheck', 'lint'];
const FORBIDDEN_WORDS = ['rm', 'rmdir', 'unlink', 'mv', 'git', 'curl', 'wget', 'sudo', 'chmod', 'install', 'exec'];
const STEP_MARKERS = [
  'kebab-case',
  '_new-world',
  'six World<S, A> functions',
  'world.config.ts',
  'wards.yaml',
  'registration gate',
  'ward properties',
  'Report',
];
// Built from parts: the hygiene test reads a literal scheme-slash-dot as a host.
const FILE_PREFIX = 'file:' + '//./';
const COMMENT_OPENER = String.fromCodePoint(0x3c, 0x21, 0x2d, 0x2d);
const HIDDEN_RE = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]|[\u{E0000}-\u{E007F}]/u;
const USER_NAMES = [userInfo().username].filter((n) => n.length > 3);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
const ABSOLUTE_RE = /(^|[\s"'=:(])(\/(Users|home|root|tmp|var|etc|opt)\/|[A-Za-z]:\\)/;

/**
 * Validate the text of an agent file. Returns error strings (empty = valid).
 * @param {string} text
 * @param {(relPath: string) => boolean} [exists]
 * @param {string[]} [userNames]
 * @returns {string[]}
 */
export function validateAgentFile(text, exists = (p) => existsSync(join(REPO, p)), userNames = USER_NAMES) {
  /** @type {string[]} */
  const errors = [];
  /** @type {any} */
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return ['not valid JSON'];
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return ['top level must be an object'];

  if (doc.name !== 'world-smith') errors.push('name must be world-smith');
  if (typeof doc.description !== 'string' || doc.description.trim() === '') errors.push('description is empty');
  if ('model' in doc) errors.push('model must not be set (Auto)');
  if (typeof doc.welcomeMessage !== 'string' || doc.welcomeMessage.trim() === '') errors.push('welcomeMessage is empty');

  /** @type {string[]} */
  const tools = Array.isArray(doc.tools) ? doc.tools : [];
  for (const t of ['read', 'write', 'shell']) if (!tools.includes(t)) errors.push(`tools must contain ${t}`);
  if (tools.some((t) => typeof t === 'string' && t.includes('*'))) errors.push('tools must not contain a wildcard');
  if (doc.includeMcpJson !== false) errors.push('includeMcpJson must be false');
  if (doc.includePowers !== false) errors.push('includePowers must be false');
  if (!Array.isArray(doc.excludedTools) || !doc.excludedTools.some((/** @type {unknown} */ t) => typeof t === 'string' && t.includes('kirocrew-work'))) {
    errors.push('excludedTools must name kirocrew-work');
  }

  const resources = Array.isArray(doc.resources) ? doc.resources : [];
  /** @type {string[]} */
  const paths = [];
  for (const r of resources) {
    if (typeof r !== 'string' || !r.startsWith(FILE_PREFIX)) {
      errors.push(`resource is not a relative file:// URI: ${String(r)}`);
      continue;
    }
    const p = r.slice(FILE_PREFIX.length);
    if (p.startsWith('/') || p.split('/').includes('..')) errors.push(`resource path is absolute or has "..": ${p}`);
    else if (!exists(p)) errors.push(`resource does not exist: ${p}`);
    paths.push(p);
  }
  if (paths.length !== REQUIRED_RESOURCES.length || !REQUIRED_RESOURCES.every((p) => paths.includes(p))) {
    errors.push('resources must be exactly the four required files');
  }

  const rules = doc.permissions && Array.isArray(doc.permissions.rules) ? doc.permissions.rules : [];
  for (const rule of rules) {
    if (rule.effect !== 'allow' || rule.capability !== 'shell') errors.push('every rule must be a shell allow rule');
    for (const m of Array.isArray(rule.match) ? rule.match : []) {
      const last = String(m).split(' ').pop() ?? '';
      if (!String(m).startsWith('corepack pnpm ') || !RULE_ENDINGS.includes(last)) errors.push(`rule is not test, typecheck, or lint: ${m}`);
      for (const w of String(m).split(/[^A-Za-z0-9_-]+/)) if (FORBIDDEN_WORDS.includes(w)) errors.push(`rule contains ${w}: ${m}`);
    }
  }

  const prompt = typeof doc.prompt === 'string' ? doc.prompt : '';
  let at = -1;
  for (const marker of STEP_MARKERS) {
    const next = prompt.indexOf(marker, at + 1);
    if (next < 0) errors.push(`prompt step marker missing or out of order: ${marker}`);
    else at = next;
  }
  for (const needle of ['world-scaffold', 'contract-pbt', 'templates.mjs', 'corepack pnpm --filter']) {
    if (!prompt.includes(needle)) errors.push(`prompt does not mention ${needle}`);
  }
  if (!/Change only/.test(prompt) || !/canary/i.test(prompt) || !/hidden/i.test(prompt) || !/without asking/.test(prompt)) {
    errors.push('prompt does not state the limits');
  }
  if (prompt.includes('kirocrew-')) errors.push('prompt mentions a kirocrew- agent');

  if (text.includes(COMMENT_OPENER)) errors.push('contains the HTML comment opener');
  if (HIDDEN_RE.test(text)) errors.push('contains a hidden character');
  if (ABSOLUTE_RE.test(text)) errors.push('contains an absolute path');
  if (EMAIL_RE.test(text)) errors.push('contains an e-mail address');
  for (const u of userNames) if (text.includes(u)) errors.push('contains the local user name');
  return errors;
}

/** @param {string} rel */
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

describe('world-smith agent file', () => {
  it('is valid', () => {
    expect(validateAgentFile(read(AGENT))).toEqual([]);
  });

  it('sets no model and keeps Powers and MCP config off', () => {
    const doc = JSON.parse(read(AGENT));
    expect('model' in doc).toBe(false);
    expect(doc.includePowers).toBe(false);
    expect(doc.includeMcpJson).toBe(false);
  });

  it('passes the possession scan with the three spec files (blacklight)', async () => {
    const files = [AGENT, ...SPEC_FILES].map((f) => join(REPO, f));
    const report = await scanFiles(files, { markdown: 'by-extension' });
    expect(report.files.length).toBe(files.length);
    expect(report.outcome, formatReport(report)).toBe('clean');
  }, 60_000);

  it('spec files contain no hidden character, comment opener, e-mail, or home path', () => {
    for (const f of SPEC_FILES) {
      const t = read(f);
      expect(HIDDEN_RE.test(t), f).toBe(false);
      expect(t.includes(COMMENT_OPENER), f).toBe(false);
      expect(EMAIL_RE.test(t), f).toBe(false);
      expect(ABSOLUTE_RE.test(t), f).toBe(false);
    }
  });
});

describe('validateAgentFile negative examples', () => {
  /** @returns {any} */
  const good = () => JSON.parse(read(AGENT));
  /** @param {(d: any) => void} mutate */
  const bad = (mutate) => {
    const doc = good();
    mutate(doc);
    return validateAgentFile(JSON.stringify(doc));
  };

  it('rejects a model', () => {
    expect(bad((d) => { d.model = 'auto'; })).toContain('model must not be set (Auto)');
  });
  it('rejects a wildcard tool', () => {
    expect(bad((d) => { d.tools = ['*']; }).length).toBeGreaterThan(0);
  });
  it('rejects an rm allow rule', () => {
    const errors = bad((d) => { d.permissions.rules[0].match.push('corepack pnpm rm lint'); });
    expect(errors.some((e) => e.includes('contains rm'))).toBe(true);
  });
  it('rejects a rule that does not end in test, typecheck, or lint', () => {
    const errors = bad((d) => { d.permissions.rules[0].match = ['corepack pnpm build']; });
    expect(errors.some((e) => e.includes('not test, typecheck, or lint'))).toBe(true);
  });
  it('rejects a missing resource', () => {
    const errors = bad((d) => { d.resources.push(`${FILE_PREFIX}does/not/exist.md`); });
    expect(errors.some((e) => e.includes('does not exist'))).toBe(true);
  });
  it('rejects an absolute path and a parent path in resources', () => {
    expect(bad((d) => { d.resources[0] = 'file:' + '///etc/hosts'; }).length).toBeGreaterThan(0);
    expect(bad((d) => { d.resources[0] = `${FILE_PREFIX}../outside.md`; }).length).toBeGreaterThan(0);
  });
  it('rejects powers on, MCP config on, and a missing Crew exclusion', () => {
    expect(bad((d) => { d.includePowers = true; })).toContain('includePowers must be false');
    expect(bad((d) => { d.includeMcpJson = true; })).toContain('includeMcpJson must be false');
    expect(bad((d) => { d.excludedTools = []; })).toContain('excludedTools must name kirocrew-work');
  });
  it('rejects hidden characters and the comment opener in the prompt', () => {
    expect(bad((d) => { d.prompt += String.fromCodePoint(0x200b); })).toContain('contains a hidden character');
    expect(bad((d) => { d.prompt += COMMENT_OPENER; })).toContain('contains the HTML comment opener');
  });
  it('rejects a prompt with steps out of order', () => {
    const errors = bad((d) => { d.prompt = d.prompt.replace('kebab-case', 'x').replace('Report', 'Report kebab-case'); });
    expect(errors.some((e) => e.includes('out of order'))).toBe(true);
  });
  it('rejects invalid JSON', () => {
    expect(validateAgentFile('{')).toEqual(['not valid JSON']);
  });
});
