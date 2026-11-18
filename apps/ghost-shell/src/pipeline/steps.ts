import type { StepRecord } from '@ghost-run/playground-shell';

export interface StepView {
  readonly stepIndex: number;
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly unsupported: boolean;
  readonly watchdog: boolean;
}

/** Plain-value projection of the step records (display escaping happens in the screens). */
export function toStepViews(steps: readonly StepRecord[]): StepView[] {
  return steps.map((s) => ({
    stepIndex: s.stepIndex,
    command: s.command,
    exitCode: s.exitCode,
    stdout: s.stdout,
    stderr: s.stderr,
    unsupported: s.unsupported,
    watchdog: s.watchdog,
  }));
}

export function unsupportedStepIndexes(steps: readonly { stepIndex: number; unsupported: boolean }[]): number[] {
  return steps.filter((s) => s.unsupported).map((s) => s.stepIndex);
}
