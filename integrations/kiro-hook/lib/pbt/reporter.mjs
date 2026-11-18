// Vitest reporter for contract-pbt, written against vitest 3.2.x (the version in
// pnpm-lock.yaml). It prints one JSON line per event on STDOUT. The hook reads
// the lines whose first key is `ghostPbt`, so a deadline stop still leaves the
// finished tests known. Needed reporter hooks: onTestRunStart, onTestModuleCollected,
// onTestCaseResult (the Reporter API of vitest 3; `REQUIRED_HOOKS` lists them and a
// test fails when one is absent).

export const LINE_KEY = 'ghostPbt';

/** Reporter hooks that this module must implement. */
export const REQUIRED_HOOKS = Object.freeze(['onTestRunStart', 'onTestModuleCollected', 'onTestCaseResult']);

const MAX_MESSAGE = 4000;

/** @param {Record<string, unknown>} obj */
function emit(obj) {
  process.stdout.write(`${JSON.stringify({ [LINE_KEY]: 1, ...obj })}\n`);
}

/**
 * Reduce the errors of a failed test to one bounded text.
 * @param {unknown} errors
 * @returns {string}
 */
export function errorText(errors) {
  if (!Array.isArray(errors)) return '';
  const text = errors
    .map((e) => (e && typeof e === 'object' && typeof e.message === 'string' ? e.message : ''))
    .filter((m) => m !== '')
    .join('\n');
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}...` : text;
}

export default class ContractPbtReporter {
  /** @param {ReadonlyArray<{ moduleId?: string, project?: unknown }>} specifications */
  onTestRunStart(specifications) {
    const files = Array.isArray(specifications)
      ? specifications.map((s) => (typeof s?.moduleId === 'string' ? s.moduleId : '')).filter((f) => f !== '')
      : [];
    emit({ e: 'files', files });
  }

  /** @param {{ moduleId?: string, children?: { allTests?: () => Iterable<{ fullName: string }> } }} mod */
  onTestModuleCollected(mod) {
    const names = [];
    for (const t of mod?.children?.allTests?.() ?? []) names.push(t.fullName);
    emit({ e: 'collected', file: mod?.moduleId ?? '', names });
  }

  /** @param {{ fullName: string, module?: { moduleId?: string }, result: () => { state: string, errors?: unknown }, diagnostic?: () => { duration?: number } | undefined }} testCase */
  onTestCaseResult(testCase) {
    const res = testCase.result();
    const state = res.state === 'passed' || res.state === 'failed' || res.state === 'skipped' ? res.state : 'failed';
    emit({
      e: 'test',
      name: testCase.fullName,
      file: testCase.module?.moduleId ?? '',
      state,
      ms: Math.round(testCase.diagnostic?.()?.duration ?? 0),
      message: state === 'failed' ? errorText(res.errors) : '',
    });
  }
}
