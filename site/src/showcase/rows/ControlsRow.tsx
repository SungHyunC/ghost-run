import { KitRoot } from '@ghost-run/ui';

export function ControlsRow() {
  return (
    <KitRoot>
      <p>
        <button type="button" className="gk-button">
          Run ghost
        </button>{' '}
        <button type="button" className="gk-button" disabled>
          Disabled
        </button>
      </p>
      <p>
        <label htmlFor="kit-input">Command</label>
        <input id="kit-input" type="text" className="gk-input" placeholder="ls -la" />
      </p>
      <p>
        <label htmlFor="kit-input-invalid">Invalid command</label>
        <input id="kit-input-invalid" type="text" className="gk-input" aria-invalid="true" defaultValue="rm -rf" />
      </p>
      <p>
        <label htmlFor="kit-textarea">Plan</label>
        <textarea id="kit-textarea" className="gk-textarea" placeholder="One step per line" />
      </p>
      <p>
        <label htmlFor="kit-textarea-disabled">Disabled plan</label>
        <textarea id="kit-textarea-disabled" className="gk-textarea" disabled defaultValue="locked" />
      </p>
    </KitRoot>
  );
}
