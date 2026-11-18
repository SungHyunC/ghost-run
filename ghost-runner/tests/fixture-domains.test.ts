// [no-docker] Requirement 18.7: fixtures use only reserved domains (and registry.npmjs.org as the
// allow_hosts example) or RFC 5737 documentation addresses.
// **Validates: Requirements 18.7**
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const RESERVED = /\.(example|test|localhost|invalid)$/i;
const DOC_IP = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;
const ALLOWED = new Set(['registry.npmjs.org']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function hostsIn(text: string): string[] {
  const hosts: string[] = [];
  for (const m of text.matchAll(/\b(?:https?|wss?|ftp|telnet):\/\/([A-Za-z0-9.-]+)/g)) hosts.push(m[1]!);
  for (const m of text.matchAll(/\ballow_hosts\s*:\s*\[([^\]]*)\]/g)) {
    for (const h of m[1]!.split(',')) {
      const t = h.trim().replace(/^['"]|['"]$/g, '');
      if (t !== '') hosts.push(t);
    }
  }
  return hosts;
}

it('fixture files and scenario sources contain only reserved domains, documentation IPs, or registry.npmjs.org', () => {
  const files = [...walk(join(here, 'fixtures')), join(here, 'scenarios-18.docker.test.ts')];
  const bad: string[] = [];
  let seen = 0;
  for (const f of files) {
    for (const h of hostsIn(readFileSync(f, 'utf8'))) {
      seen += 1;
      if (!(ALLOWED.has(h) || RESERVED.test(h) || DOC_IP.test(h))) bad.push(`${f}: ${h}`);
    }
  }
  expect(seen).toBeGreaterThan(0);
  expect(bad).toEqual([]);
});
