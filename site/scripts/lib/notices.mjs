// The site's own THIRD_PARTY_NOTICES.txt: one section for every third-party package of the landing bundle and its
// engine chunks (read from the installed packages), then the components compiled into mujoco.wasm
// (from the notices folder of the Ghost Hand app, which keeps the upstream license texts).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RULE = '='.repeat(72);
const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[-._].*)?$/i;

/** Where a package without a license file of its own gets its text (repo-relative). */
const LICENSE_FALLBACKS = Object.freeze({
  '@mujoco/mujoco': 'apps/ghost-hand/notices/mujoco.LICENSE.txt',
});

/** Heading line of the section of one package; the site check looks for this exact line. */
export function packageHeading(pkg) {
  return `${pkg.name} ${pkg.version}`;
}

/**
 * @param {string} root repository root
 * @param {{ name: string, version: string, license: string, dir: string }} pkg
 * @returns {{ text: string, files: string[] }}
 */
function licenseTextOf(root, pkg) {
  const dir = path.join(root, pkg.dir);
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => LICENSE_FILE.test(n)).sort() : [];
  const texts = files.map((n) => readFileSync(path.join(dir, n), 'utf8').replace(/\s+$/, '')).filter((t) => t !== '');
  if (texts.length > 0) return { text: texts.join('\n\n'), files };
  const fallback = LICENSE_FALLBACKS[pkg.name];
  if (fallback !== undefined) {
    const text = readFileSync(path.join(root, fallback), 'utf8').replace(/\s+$/, '');
    if (text !== '') return { text, files: [fallback] };
  }
  throw new Error(`no license text for ${packageHeading(pkg)} (looked in ${pkg.dir})`);
}

/**
 * @param {{ root: string, packages: { name: string, version: string, license: string, dir: string }[] }} input
 * @returns {string} the text of the notices file
 */
export function renderNotices({ root, packages }) {
  if (packages.length === 0) throw new Error('the bundled package list is empty');
  const noticesDir = path.join(root, 'apps', 'ghost-hand', 'notices');
  const sources = JSON.parse(readFileSync(path.join(noticesDir, 'sources.json'), 'utf8'));
  const native = sources.components.filter((c) => c.bundledIn === 'mujoco.wasm');

  const parts = [
    'THIRD-PARTY NOTICES FOR GHOST RUN+ (LANDING PAGE)',
    '',
    'The landing page and its engine chunks bundle the packages below. Each license text is',
    'copied unchanged from the installed package. The components compiled into mujoco.wasm',
    'follow, with the license texts of their upstream sources.',
    '',
    'Packages:',
    ...packages.map((p) => `  - ${packageHeading(p)} (${p.license === '' ? 'see license text' : p.license})`),
    '',
    'Compiled into mujoco.wasm:',
    ...native.map((c) => `  - ${c.name} ${c.version} (${c.spdx})`),
  ];
  for (const pkg of packages) {
    const { text } = licenseTextOf(root, pkg);
    parts.push('', RULE, packageHeading(pkg), `License: ${pkg.license === '' ? 'see text below' : pkg.license}`, RULE, '', text);
  }
  for (const c of native) {
    const file = path.join(noticesDir, c.file);
    if (!existsSync(file)) throw new Error(`missing license text for ${c.id}: ${c.file}`);
    const text = readFileSync(file, 'utf8').replace(/\s+$/, '');
    if (text === '') throw new Error(`empty license text for ${c.id}`);
    parts.push('', RULE, `${c.name} ${c.version}`, `License: ${c.spdx}`, `Upstream: ${c.upstream}`);
    if (c.sourceNotice) parts.push(c.sourceNotice);
    parts.push(RULE, '', text);
  }
  return `${parts.join('\n')}\n`;
}

/**
 * The packages of a manifest that the notices text does not cover: no heading line, or a heading without a
 * license line right after the rule, or an empty license text.
 * @param {string} noticesText
 * @param {readonly { name: string, version: string }[]} packages
 * @returns {{ name: string, version: string }[]}
 */
export function missingFromNotices(noticesText, packages) {
  const lines = noticesText.split(/\r?\n/);
  return packages.filter((pkg) => {
    const at = lines.findIndex((line) => line === packageHeading(pkg));
    if (at < 0) return true;
    if (!/^License: \S/.test(lines[at + 1] ?? '')) return true;
    // The text after the closing rule must not be empty.
    const body = lines.slice(at + 3).findIndex((l) => l.trim() !== '');
    return body < 0 || (lines[at + 3 + body] ?? '').startsWith(RULE);
  });
}
