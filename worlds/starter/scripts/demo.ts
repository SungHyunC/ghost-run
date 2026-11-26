// Prints the demo. Run: corepack pnpm --filter @ghost-run/world-starter demo [--wards <file>]
// Without --wards the demo reads worlds/starter/wards.yaml. No build, browser, Docker, or network.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultWardsText, runDemo } from './run-demo.js';

const args = process.argv.slice(2);
const at = args.indexOf('--wards');
let wardsText = defaultWardsText();
if (at !== -1) {
  const file = args[at + 1];
  if (file === undefined || file.startsWith('--')) {
    console.error('usage: demo [--wards <file>]');
    process.exit(2);
  }
  wardsText = readFileSync(resolve(file), 'utf8');
}

console.log(await runDemo(wardsText));
