// Headers_File helpers: parse, print, and scope the blocks of a `_headers` file,
// and build the root file of the assembled site (design Component 11).
// A block is a path line (no indentation) followed by indented header lines.

import { handHeaderPolicy, landingHeaderPolicy } from './csp.mjs';

/**
 * @typedef {{ path: string, headers: string[] }} HeaderBlock
 */

/** The three headers of the Landing_Page blocks, in order. */
export const LANDING_HEADERS = Object.freeze([
  `Content-Security-Policy: ${landingHeaderPolicy()}`,
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: no-referrer',
]);

/** The three headers of the `/hand/` blocks, in order. */
export const HAND_HEADERS = Object.freeze([
  `Content-Security-Policy: ${handHeaderPolicy()}`,
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: no-referrer',
]);

/**
 * @param {string} text
 * @returns {HeaderBlock[]}
 */
export function parseHeaders(text) {
  /** @type {HeaderBlock[]} */
  const blocks = [];
  /** @type {HeaderBlock | null} */
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    if (/^\s/.test(raw)) {
      if (current === null) throw new Error(`header line before any path line: ${raw.trim()}`);
      current.headers.push(raw.trim());
    } else {
      current = { path: raw.trim(), headers: [] };
      blocks.push(current);
    }
  }
  return blocks;
}

/**
 * @param {readonly HeaderBlock[]} blocks
 * @returns {string}
 */
export function printHeaders(blocks) {
  const lines = [];
  for (const block of blocks) {
    lines.push(block.path);
    for (const header of block.headers) lines.push(`  ${header}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Rewrites only the path line: `/*` becomes `PREFIX/*`, any other `P` becomes `PREFIX` + `P`.
 * @param {readonly HeaderBlock[]} blocks
 * @param {string} prefix
 * @returns {HeaderBlock[]}
 */
export function scopeBlocks(blocks, prefix) {
  if (blocks.length === 0) throw new Error('no header block to scope');
  return blocks.map((block) => ({
    path: `${prefix}${block.path}`,
    headers: [...block.headers],
  }));
}

/**
 * @param {string} shellHeadersText text of apps/ghost-shell/dist/_headers
 * @returns {string} text of the root _headers file
 */
export function buildRootHeaders(shellHeadersText) {
  const shell = scopeBlocks(parseHeaders(shellHeadersText), '/shell');
  return printHeaders([
    { path: '/', headers: [...LANDING_HEADERS] },
    { path: '/index.html', headers: [...LANDING_HEADERS] },
    { path: '/kit/', headers: [...LANDING_HEADERS] },
    { path: '/kit/index.html', headers: [...LANDING_HEADERS] },
    { path: '/hand/', headers: [...HAND_HEADERS] },
    { path: '/hand/*', headers: [...HAND_HEADERS] },
    ...shell,
  ]);
}
