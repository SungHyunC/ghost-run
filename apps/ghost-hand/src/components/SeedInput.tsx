import { useId } from 'react';
import { SEED_LABEL } from '../ui-text';

export interface SeedInputProps {
  readonly text: string;
  readonly error: string | null;
  readonly disabled?: boolean;
  readonly onChange: (text: string) => void;
}

/** Digits-only seed field. The parse (parseSeedInput) happens in the shell; a rejection starts no run. */
export function SeedInput({ text, error, disabled, onChange }: SeedInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="gh-field">
      <label htmlFor={id}>{SEED_LABEL}</label>
      <input
        id={id}
        className="gk-input gh-mono"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={text}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      {error !== null ? (
        <p id={errorId} role="alert" className="gh-error">
          <span aria-hidden="true">{'\u2715 '}</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
