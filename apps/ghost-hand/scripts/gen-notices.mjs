// Writes dist/THIRD_PARTY_NOTICES.txt from notices/sources.json and the
// upstream license texts in notices/. Fails if any listed text is missing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const noticesDir = join(root, 'notices');
const sources = JSON.parse(readFileSync(join(noticesDir, 'sources.json'), 'utf8'));

const rule = '='.repeat(72);
const parts = [
  'THIRD-PARTY NOTICES FOR GHOST HAND',
  '',
  'This build bundles the components below. Each license text is copied',
  'unchanged from the upstream source distribution or package.',
  '',
  'Components:',
];
for (const c of sources.components) {
  parts.push(`  - ${c.name} ${c.version} (${c.spdx}), in ${c.bundledIn}`);
}
for (const c of sources.components) {
  const file = join(noticesDir, c.file);
  if (!existsSync(file)) {
    throw new Error(`missing license text for ${c.id}: ${c.file}`);
  }
  const text = readFileSync(file, 'utf8').replace(/\s+$/, '');
  if (text.length === 0) throw new Error(`empty license text for ${c.id}`);
  parts.push('', rule, `${c.name} ${c.version}`, `License: ${c.spdx}`, `Upstream: ${c.upstream}`);
  if (c.sourceNotice) parts.push(c.sourceNotice);
  parts.push(rule, '', text);
}
const out = join(root, 'dist', 'THIRD_PARTY_NOTICES.txt');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${parts.join('\n')}\n`, 'utf8');
console.log(`wrote dist/THIRD_PARTY_NOTICES.txt (${sources.components.length} components)`);
