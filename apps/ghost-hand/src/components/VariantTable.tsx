import { escapeForDisplay as esc } from '@ghost-run/ui';
import { fixed } from '../format';
import type { VariantRow } from '../pipeline/types';
import { NO_RUN_TEXT, TABLE_CAPTION, TABLE_HEADING } from '../ui-text';

export interface VariantTableProps {
  readonly id: string;
  readonly rows: readonly VariantRow[];
}

/** One row per variant and one for `base`. Status is an icon plus a word, never color alone. */
export function VariantTable({ id, rows }: VariantTableProps) {
  const headingId = `${id}-heading`;
  return (
    <section className="gk-section" aria-labelledby={headingId}>
      <h2 className="gk-heading" id={headingId}>
        {TABLE_HEADING}
      </h2>
      {rows.length === 0 ? (
        <p className="gk-empty">{NO_RUN_TEXT}</p>
      ) : (
        <div className="gh-table-wrap">
          <table id={id} className="gh-table">
            <caption>{TABLE_CAPTION}</caption>
            <thead>
              <tr>
                <th scope="col">variantId</th>
                <th scope="col">status</th>
                <th scope="col">drawer displacement (m)</th>
                <th scope="col">max contact force (N)</th>
                <th scope="col">vase touched</th>
                <th scope="col">drawer friction (N)</th>
                <th scope="col">drawer mass (kg)</th>
                <th scope="col">handle offset x, y, z (m)</th>
                <th scope="col">sensor noise (m)</th>
                <th scope="col">command delay (steps)</th>
                <th scope="col">noise seed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const failed = row.status === 'failed';
                const p = row.params;
                return (
                  <tr key={row.id} data-status={row.status} className={failed ? 'gh-row-failed' : undefined}>
                    <th scope="row">{esc(row.id)}</th>
                    <td>
                      <span className={failed ? 'gh-status gh-status-failed' : 'gh-status'}>
                        <span aria-hidden="true">{failed ? '\u2715' : '\u2713'}</span>
                        <span>{esc(row.status)}</span>
                      </span>
                    </td>
                    <td>{esc(fixed(row.drawerDisplacementM, 4))}</td>
                    <td>{esc(fixed(row.maxContactForceN, 2))}</td>
                    <td>{row.vaseTouched ? 'yes' : 'no'}</td>
                    <td>{esc(fixed(p.drawerFrictionN, 3))}</td>
                    <td>{esc(fixed(p.drawerMassKg, 3))}</td>
                    <td>{esc(p.handleOffsetM.map((v) => fixed(v, 5)).join(', '))}</td>
                    <td>{esc(fixed(p.sensorNoiseM, 5))}</td>
                    <td>{esc(String(p.commandDelaySteps))}</td>
                    <td>{esc(String(p.noiseSeed))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
