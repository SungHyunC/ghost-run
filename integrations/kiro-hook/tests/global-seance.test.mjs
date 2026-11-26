import { describe, expect, it } from 'vitest';
import { tempRootViewers } from './global-seance.mjs';

const ROOTS = ['/tmp', '/var/folders'];
/** @param {string} root */
const V = (root) => `123 /usr/bin/node /repo/integrations/kiro-hook/seance.mjs --root ${root} --port 5317`;

describe('global-seance leak check', () => {
  it('flags a viewer whose root is a temp folder', () => {
    expect(tempRootViewers(V('/var/folders/ab/T/ghost-x'), ROOTS)).toHaveLength(1);
  });
  it('ignores a viewer of a real project', () => {
    expect(tempRootViewers(V('/Users/me/project'), ROOTS)).toEqual([]);
  });
  it('ignores a process that only mentions the script in its arguments', () => {
    const line = '9 kiro-cli chat run node integrations/kiro-hook/seance.mjs --root /var/folders/x/y';
    expect(tempRootViewers(line, ROOTS)).toEqual([]);
  });
});
