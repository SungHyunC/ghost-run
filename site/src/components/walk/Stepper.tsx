const LABELS: readonly string[] = ['Copy', 'Run', 'Judge', 'Verdict', 'Fix & go'];

export interface StepperProps {
  /** 0-based current step; -1 before the first step. */
  step: number;
  /** How many of the last steps the run cannot reach (0 to 4). Those buttons are disabled. */
  disabledSteps?: number;
  onJump: (n: number) => void;
}

/** The slim stepper: an ordered list of five step buttons. */
export function Stepper({ step, disabledSteps = 0, onJump }: StepperProps) {
  const firstDisabled = LABELS.length - disabledSteps;
  return (
    <ol className="stepper" id="rail">
      {LABELS.map((label, k) => {
        const cls = k === step ? 'now' : k < step ? 'done' : undefined;
        const disabled = k >= firstDisabled;
        return (
          <li key={label}>
            <button
              type="button"
              data-s={k}
              className={cls}
              aria-current={k === step ? 'step' : undefined}
              aria-disabled={disabled ? true : undefined}
              onClick={() => {
                if (!disabled) onJump(k);
              }}
            >
              <i>{k + 1}</i>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
