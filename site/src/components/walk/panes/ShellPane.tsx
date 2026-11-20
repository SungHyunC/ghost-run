import type { CSSProperties } from 'react';
import type { RealityScene, ShellEntry } from '../../../data/types';
import { formatCount } from '../../../engine/format';
import type { CopyItemState } from '../../../engine/types';
import { Icon } from '../../art/Icon';

type ShellScene = Extract<RealityScene, { kind: 'shell' }>;
type ShellState = Extract<CopyItemState, { world: 'shell' }>;

export type ShellPaneProps = { scene: ShellScene } & ({ side: 'real' } | { side: 'copy'; state: ShellState });

/** Bars drawn for a table: clamp(2, 12, round(rows / 100)). */
const barCount = (rows: number): number => Math.min(12, Math.max(2, Math.round(rows / 100)));

const idx = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

const label = (e: ShellEntry): string => (e.kind === 'dir' ? `${e.name}/` : e.name);

function Bars({ total, gone }: { total: number; gone: number }) {
  return (
    <span className="bars">
      {Array.from({ length: barCount(total) }, (_, k) => (
        <span key={k} className={k < gone ? 'bar gone' : 'bar'} />
      ))}
    </span>
  );
}

/** One entry row. A `gone` entry is struck through and puffs away; a `new` entry carries the `new` badge. */
function Entry({ entry, i }: { entry: ShellEntry; i: number }) {
  const icon = entry.kind === 'dir' ? 'i-folder' : entry.name.endsWith('.db') ? 'i-db' : 'i-file';
  const cls = entry.state === 'new' ? 'node l1 new' : entry.state === 'gone' ? 'node l1 poof' : 'node l1';
  return (
    <div className={cls} data-entry={entry.name} data-state={entry.state} style={idx(i)}>
      <Icon id={icon} viewBox="0 0 24 24" />
      {entry.state === 'gone' ? <s>{label(entry)}</s> : label(entry)}
      {entry.state === 'new' ? <span className="new">new</span> : null}
    </div>
  );
}

/** The scene builder `shellPane` of the Mockup, drawn from the entries and tables of the walk state. */
export function ShellPane(props: ShellPaneProps) {
  const { scene } = props;
  const state = props.side === 'copy' ? props.state : null;
  const entries = state?.entries ?? scene.entries;
  const db = entries.find((e) => e.name.endsWith('.db')) ?? null;
  const others = entries.filter((e) => e !== db);
  let i = 0;
  return (
    <div className="tree">
      <div className="node" style={idx(i++)}>
        <Icon id="i-folder" viewBox="0 0 24 24" />
        {scene.root}
      </div>
      {db === null ? null : <Entry entry={db} i={i++} />}
      {scene.tables.map((t) => {
        const isUsers = t.name === 'users';
        const live = state?.tables.find((x) => x.name === t.name) ?? null;
        const cls = live !== null && live.cls !== 'none' ? `tbl l2 ${live.cls}` : 'tbl l2';
        return (
          <div className={cls} data-t={t.name} key={t.name} style={idx(i++)}>
            <span className="tn">{t.name}</span>
            <Bars total={t.rows} gone={live?.bars ?? 0} />
            <span className="cnt">{formatCount(live?.count ?? t.rows)}</span>
            {isUsers || (live?.tag ?? '') !== '' ? <span className="tag">{live?.tag ?? ''}</span> : null}
          </div>
        );
      })}
      {others.map((e) => (
        <Entry entry={e} key={e.name} i={i++} />
      ))}
    </div>
  );
}
