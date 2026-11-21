import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UI_RENDER_RULES } from '../../src/showcase/copy';

const here = dirname(fileURLToPath(import.meta.url));

describe('UI_RENDER_RULES', () => {
  it('equals the number of UI-P ids in the ui-kit requirements', () => {
    const text = readFileSync(resolve(here, '../../../.kiro/specs/ui-kit/requirements.md'), 'utf8');
    const ids = new Set(text.match(/UI-P\d+/g) ?? []);
    expect(UI_RENDER_RULES).toBe(ids.size);
  });
});
