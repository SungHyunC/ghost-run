// Shared constants of the landing page. DUR is the only copy of the walkthrough step durations.

/** The one public repository URL (owner decision O1). */
export const REPO_URL = 'https://github.com/SungHyunC/ghost-run';

/** Nominal step durations in ms: Copy, Run on the copy, Judge, Verdict, Fix and go. */
export const DUR: readonly number[] = [2700, 3900, 3300, 2700, 5200];

/** X-ray demo: switch on after this many ms. */
export const XRAY_ON_MS = 1600;
/** X-ray demo: switch off after this many ms. */
export const XRAY_OFF_MS = 4400;

export type WorldId = 'shell' | 'hand' | 'cloud';

export const WORLDS: readonly WorldId[] = ['shell', 'hand', 'cloud'];

export interface StepInfo {
  readonly num: number;
  readonly label: string;
  readonly code: string;
}

export const STEPS: readonly StepInfo[] = [
  { num: 1, label: 'Copy', code: 'snapshot()' },
  { num: 2, label: 'Run on the copy', code: 'step()' },
  { num: 3, label: 'Judge', code: 'diff() · effectsOutside()' },
  { num: 4, label: 'Verdict', code: 'render() · fingerprint()' },
  { num: 5, label: 'Fix and go', code: 'the agent tries again' },
];

export const DOC_TITLE = "Ghost Run+: let your agent's ghost try it first";
