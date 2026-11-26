import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Task 1.8: the probe hook files stay in the repository (task 28.1 moved them to
// integrations/kiro-hook/experiments/) but must be off once the results
// table (heading `Probe results`) exists in docs/measurements.md.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROBE_FILES = [
  'integrations/kiro-hook/experiments/probe-host-facts.json',
  'integrations/kiro-hook/experiments/probe-ask.json',
];
const MEASUREMENTS = 'docs/measurements.md';

/**
 * True when the text has a Markdown heading named exactly `Probe results`.
 * @param {string} text
 * @returns {boolean}
 */
export function hasProbeResultsHeading(text) {
  return /^#{1,6}[ \t]+Probe results[ \t]*$/m.test(text);
}

/**
 * Names of the entries of a hook file whose `enabled` is `true`.
 * @param {string} fileName
 * @param {string} text
 * @returns {string[]}
 */
export function enabledEntries(fileName, text) {
  /** @type {any} */
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return [`${fileName}: not valid JSON`];
  }
  const hooks = doc && Array.isArray(doc.hooks) ? doc.hooks : null;
  if (!hooks) return [`${fileName}: hooks must be an array`];
  return hooks
    .map((/** @type {any} */ h, /** @type {number} */ i) => (h?.enabled === true ? `${fileName}[${i}] ${String(h?.name ?? '')}` : null))
    .filter((/** @type {string | null} */ n) => n !== null);
}

/**
 * Violations: any enabled probe entry while the results heading exists.
 * @param {string} measurementsText
 * @param {Record<string, string>} files file name to file text
 * @returns {string[]}
 */
export function probeViolations(measurementsText, files) {
  if (!hasProbeResultsHeading(measurementsText)) return [];
  return Object.entries(files).flatMap(([name, text]) => enabledEntries(name, text));
}

describe('probe hook files stay disabled', () => {
  it('the repository files are present and disabled while Probe results exists', () => {
    const measurements = readFileSync(resolve(repoRoot, MEASUREMENTS), 'utf8');
    expect(hasProbeResultsHeading(measurements)).toBe(true);
    /** @type {Record<string, string>} */
    const files = {};
    for (const rel of PROBE_FILES) {
      const abs = resolve(repoRoot, rel);
      expect(existsSync(abs), rel).toBe(true);
      files[rel] = readFileSync(abs, 'utf8');
    }
    expect(probeViolations(measurements, files)).toEqual([]);
  });

  it('the probe files are no longer in .kiro/hooks', () => {
    for (const rel of PROBE_FILES) {
      expect(existsSync(resolve(repoRoot, '.kiro/hooks', rel.split('/').pop() ?? '')), rel).toBe(false);
    }
  });

  it('keeps the probe script in the package', () => {
    expect(existsSync(resolve(repoRoot, 'integrations/kiro-hook/probe-host-facts.mjs'))).toBe(true);
  });

  it('every probe-host-facts entry has enabled false, and probe-ask stays off', () => {
    for (const rel of PROBE_FILES) {
      const doc = JSON.parse(readFileSync(resolve(repoRoot, rel), 'utf8'));
      expect(doc.hooks.length, rel).toBeGreaterThan(0);
      for (const h of doc.hooks) expect(h.enabled, `${rel} ${h.name}`).toBe(false);
    }
  });

  describe('detector examples', () => {
    const on = JSON.stringify({ hooks: [{ name: 'a', enabled: true }, { name: 'b', enabled: false }] });
    const off = JSON.stringify({ hooks: [{ name: 'a', enabled: false }] });

    it('fails when an entry is enabled and the heading exists', () => {
      const v = probeViolations('## Probe results\n', { 'p.json': on });
      expect(v).toEqual(['p.json[0] a']);
    });

    it('passes when all entries are disabled', () => {
      expect(probeViolations('## Probe results\n', { 'p.json': off })).toEqual([]);
    });

    it('passes while the heading is missing', () => {
      expect(probeViolations('## Other\n', { 'p.json': on })).toEqual([]);
    });

    it('treats a string "true", a missing field, and a similar heading as not matching', () => {
      expect(enabledEntries('p.json', JSON.stringify({ hooks: [{ enabled: 'true' }, {}] }))).toEqual([]);
      expect(hasProbeResultsHeading('## Probe results (old)\n')).toBe(false);
      expect(hasProbeResultsHeading('text Probe results\n')).toBe(false);
    });

    it('reports invalid JSON and a missing hooks array', () => {
      expect(enabledEntries('p.json', '{')).toEqual(['p.json: not valid JSON']);
      expect(enabledEntries('p.json', '{}')).toEqual(['p.json: hooks must be an array']);
    });
  });
});
