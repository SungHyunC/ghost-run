import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

// ESLint fixture test: one-line fixtures prove each banned construct is an error.
// Validates: Requirements 1.4, 1.5, 4.1, 4.2

const uiRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturePath = `${uiRoot}src/fixture.tsx`;
const configUrl = new URL('../../eslint.config.mjs', import.meta.url).href;

const PLUGIN_RULES = [
  '@eslint-react/dom-no-dangerously-set-innerhtml',
  '@eslint-react/dom-no-dangerously-set-innerhtml-with-children',
] as const;

async function loadConfig(): Promise<Linter.Config[]> {
  const mod = (await import(/* @vite-ignore */ configUrl)) as { default: Linter.Config[] };
  return mod.default;
}

type RuleFilter = (ruleId: string) => boolean;

/** Keep only the rules accepted by `keep` in every config block (a block without rules is kept as is). */
function restrict(config: Linter.Config[], keep: RuleFilter): Linter.Config[] {
  return config.map((block) => {
    if (!block.rules) return block;
    const rules: Linter.RulesRecord = {};
    for (const [id, value] of Object.entries(block.rules)) {
      if (keep(id) && value !== undefined) rules[id] = value;
    }
    return { ...block, rules };
  });
}

async function lint(config: Linter.Config[], code: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({ cwd: uiRoot, overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintText(code, { filePath: fixturePath });
  return result?.messages ?? [];
}

function errors(messages: Linter.LintMessage[], ruleId?: string): Linter.LintMessage[] {
  return messages.filter((m) => m.severity === 2 && (ruleId === undefined || m.ruleId === ruleId));
}

describe('ESLint config enables the fixed plugin rules (Q1)', () => {
  it.each(PLUGIN_RULES)('enables %s as error in the src block', async (rule) => {
    const config = await loadConfig();
    const enabled = config.some((block) => {
      const value = block.rules?.[rule];
      const level = Array.isArray(value) ? value[0] : value;
      return block.files?.some((f) => String(f).startsWith('src/')) === true && (level === 'error' || level === 2);
    });
    expect(enabled).toBe(true);
  });
});

describe('dangerouslySetInnerHTML is blocked by each layer alone', () => {
  const code = 'export const A = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;';
  const withChildren = 'export const B = () => <div dangerouslySetInnerHTML={{ __html: "x" }}>y</div>;';

  it('plugin rule alone reports an error', async () => {
    const config = restrict(await loadConfig(), (id) => id === PLUGIN_RULES[0]);
    const found = errors(await lint(config, code));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((m) => m.ruleId === PLUGIN_RULES[0])).toBe(true);
  });

  it('plugin with-children rule alone reports an error', async () => {
    const config = restrict(await loadConfig(), (id) => id === PLUGIN_RULES[1]);
    expect(errors(await lint(config, withChildren), PLUGIN_RULES[1]).length).toBeGreaterThan(0);
  });

  it('no-restricted-syntax selector alone reports an error', async () => {
    const config = restrict(await loadConfig(), (id) => id === 'no-restricted-syntax');
    const found = errors(await lint(config, code));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });
});

const FIXTURES: ReadonlyArray<readonly [string, string, string]> = [
  ['import of @ghost-run/ghost-runner', "import { x } from '@ghost-run/ghost-runner';", 'no-restricted-imports'],
  ['import of three', "import * as T from 'three';", 'no-restricted-imports'],
  ['import of @mujoco/mujoco', "import m from '@mujoco/mujoco';", 'no-restricted-imports'],
  ['import of an apps path', "import x from '../../apps/ghost-shell/src/App';", 'no-restricted-imports'],
  ['value import from @ghost-run/core', "import { scanText } from '@ghost-run/core';", 'no-restricted-syntax'],
  ['innerHTML assignment', 'declare const el: HTMLElement; el.innerHTML = "x";', 'no-restricted-syntax'],
  ['eval', 'eval("1");', 'no-restricted-syntax'],
  ['new Function', 'new Function("return 1");', 'no-restricted-syntax'],
  ['string timer argument', 'setTimeout("go()", 1);', 'no-restricted-syntax'],
  ['new Date', 'export const d = new Date();', 'no-restricted-syntax'],
  ['style prop', 'export const A = () => <div style={{ color: "red" }} />;', 'no-restricted-syntax'],
  ['positive tabIndex', 'export const A = () => <div tabIndex={1} />;', 'no-restricted-syntax'],
  ['handler on a non-interactive element', 'export const A = () => <div onClick={() => {}} />;', 'no-restricted-syntax'],
];

describe('banned constructs are errors in src', () => {
  it.each(FIXTURES)('%s', async (_name, code, ruleId) => {
    const config = await loadConfig();
    expect(errors(await lint(config, code), ruleId).length).toBeGreaterThan(0);
  });

  it('a type import from @ghost-run/core is allowed', async () => {
    const config = await loadConfig();
    const found = errors(await lint(config, "import type { Finding } from '@ghost-run/core';"));
    expect(found).toEqual([]);
  });
});
