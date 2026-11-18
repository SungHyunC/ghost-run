import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { probeCapabilities } from '../../src/capabilities';
import {
  P2_SCOPE_TEXT,
  P2_TEXT_ENABLED,
  PLAN_ORIGIN_RECORDED_TEXT,
  PLAN_ORIGIN_SCRIPTED_TEXT,
} from '../../src/texts';

// README consistency guard. Validates: Requirements 1.10, 12.12, 19.1, 19.2, 19.3, 19.4, 19.6, 19.8.
// Only the `## Ghost Hand` section of the root README.md is tested.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
const HEADING = '## Ghost Hand';

function topSection(text: string): string {
  const start = text.search(/^## Ghost Hand$/m);
  if (start < 0) throw new Error(`section not found: ${HEADING}`);
  const rest = text.slice(start + HEADING.length);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

function subsection(body: string, title: string): string {
  const start = body.indexOf(`### ${title}`);
  if (start < 0) throw new Error(`subsection not found: ${title}`);
  const rest = body.slice(start + 4);
  const next = rest.search(/^### /m);
  return next < 0 ? rest : rest.slice(0, next);
}

function packageJsonFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'dist-node') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) packageJsonFiles(full, out);
    else if (name === 'package.json') out.push(full);
  }
  return out;
}

const body = topSection(readme);
const DATE = /\b20\d\d-\d\d-\d\d\b/;

describe('Ghost Hand README section', () => {
  it('has the claim table rows', () => {
    const claims = subsection(body, 'Claims');
    for (const prefix of ['| P1 ', '| P2 ', '| P3 ', '| P4 ', '| P5, P6 ', '| P8 ']) {
      expect(claims, prefix).toContain(prefix);
    }
    expect(claims).toMatch(/Physical hardware/);
  });

  it('states the reference simulation', () => {
    const arm = subsection(body, 'What the "real" arm is');
    expect(arm).toMatch(/reference simulation/);
    expect(arm).toMatch(/No physical robot/);
  });

  it('states recorded or scripted matching the origin of revised.plan.json', () => {
    const plan = JSON.parse(
      readFileSync(join(repoRoot, 'apps/ghost-hand/plans/revised.plan.json'), 'utf8'),
    ) as { origin: string };
    expect(['recorded', 'scripted']).toContain(plan.origin);
    const text = subsection(body, 'Plan revision: recorded or scripted');
    const shipped = text.slice(text.indexOf('The shipped revised plan'));
    expect(shipped).toContain(`\`origin: "${plan.origin}"\``);
    if (plan.origin === 'scripted') {
      expect(shipped).toContain(PLAN_ORIGIN_SCRIPTED_TEXT);
      expect(shipped).not.toContain(PLAN_ORIGIN_RECORDED_TEXT);
      expect(shipped).toMatch(/not recorded from a Kiro decision/);
    } else {
      expect(shipped).toContain(PLAN_ORIGIN_RECORDED_TEXT);
      expect(shipped).not.toContain(PLAN_ORIGIN_SCRIPTED_TEXT);
    }
  });

  it('lists the Tested_Environments and what was not tested', () => {
    const env = subsection(body, 'Tested environments and platforms');
    expect(env).toMatch(/Tested_Environments: Node\.js 20\.20\.2 and Chrome 157/);
    expect(env).toMatch(/Apple M1 Mac/);
    expect(env).toMatch(/Firefox, Safari, Linux, and x86 machines were not tested/);
    expect(env).toMatch(/Windows is unverified/);
  });

  it('lists the MuJoCo pitfalls', () => {
    const pitfalls = subsection(body, 'MuJoCo pitfalls');
    expect(pitfalls).toMatch(/<size memory="1M"\/>/);
    expect(pitfalls).toMatch(/length 0/);
    expect(pitfalls).toMatch(/DoubleBuffer\.FromArray/);
    expect(pitfalls).toMatch(/\.delete\(\)/);
    expect(pitfalls).toMatch(/data\.warning/);
  });

  it('states the three license facts', () => {
    const licenses = subsection(body, 'Licenses and assets');
    expect(licenses).toMatch(/`@mujoco\/mujoco` 4\.0\.1 declares Apache-2\.0/);
    expect(licenses).toMatch(/tarball has no LICENSE file/);
    const rows = readme.split('\n').filter((l) => l.startsWith('|'));
    const row = (name: string): string => {
      const found = rows.find((l) => l.startsWith(`| ${name} |`));
      if (found === undefined) throw new Error(`license row missing: ${name}`);
      return found;
    };
    expect(row('@mujoco/mujoco')).toMatch(/\| 4\.0\.1 \|.*\| Apache-2\.0 /);
    expect(row('@mujoco/mujoco')).toMatch(/no LICENSE file/);
    expect(row('three')).toMatch(/\| 0\.187\.0 \|.*\| MIT \|$/);
    expect(row('@types/three')).toMatch(/\| 0\.187\.0 \|.*\| MIT \|$/);
  });

  it('has a Playwright row if and only if playwright is in a package.json', () => {
    const usesPlaywright = packageJsonFiles(repoRoot).some((f) => /"playwright(-core)?"\s*:/.test(readFileSync(f, 'utf8')));
    const hasRow = readme.split('\n').some((l) => /^\| *playwright\b/i.test(l));
    expect(hasRow).toBe(usesPlaywright);
  });

  it('makes no P2 claim unless P2_TEXT_ENABLED is true', () => {
    if (P2_TEXT_ENABLED) {
      expect(body).toContain(P2_SCOPE_TEXT);
      expect(body).toMatch(/Determinism_Self_Check passed/);
    } else {
      expect(body).not.toMatch(/\bP2\b/);
    }
  });

  it('states the joint-limit ward only when the probe says jointSelfWard', () => {
    const mentions = /joint-limit/i.test(body);
    if (mentions) expect(probeCapabilities().jointSelfWard).toBe(true);
  });

  it('gives a date for every measured number', () => {
    for (const title of ['Variants of the shipped seed', 'Measured numbers of the demo runs']) {
      expect(subsection(body, title), title).toMatch(DATE);
    }
    const measured = subsection(body, 'Measured numbers of the demo runs');
    // Each paragraph or table block with a unit-bearing number carries a date or names the measurement date above it.
    const blocks = measured.split(/\n\s*\n/).filter((b) => /\d(\.\d+)? ?(ms|N|m|s)\b/.test(b));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const dated = DATE.test(block) || /Measured \(20\d\d-\d\d-\d\d/.test(block);
      const preamble = /^\|/.test(block.trim()) || /^A second browser run|^Browser timings/.test(block.trim());
      expect(dated || preamble, block.slice(0, 60)).toBe(true);
    }
    expect(measured).toMatch(/Trajectory_Hash[^]*measured on 20\d\d-\d\d-\d\d/);
    expect(measured).toMatch(/Run time of `verifyWorld`[^]*\(20\d\d-\d\d-\d\d/);
  });

  it('never calls the page sealed or isolated', () => {
    expect(body).not.toMatch(/\b(sealed|isolated)\b/i);
  });

  it('does not claim the possession scenario', () => {
    expect(body).not.toMatch(/possess/i);
  });
});
