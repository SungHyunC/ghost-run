import type { CSSProperties } from 'react';
import type { RealityScene } from '../../../data/types';
import { formatCount } from '../../../engine/format';
import type { CopyItemState } from '../../../engine/types';
import { Icon } from '../../art/Icon';

type ShellScene = Extract<RealityScene, { kind: 'shell' }>;
type ShellState = Extract<CopyItemState, { world: 'shell' }>;

export type ShellPaneProps = { scene: ShellScene } & ({ side: 'real' } | { side: 'copy'; state: ShellState });

/** Bars drawn for a table: decorative, as in the Mockup (`bars(12)` for users, `bars(2)` for orders). */
const BARS: Record<string, number> = { users: 12, orders: 2 };

const idx = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

function Bars({ name, gone }: { name: string; gone: number }) {
  const n = BARS[name] ?? 2;
  return (
    <span className="bars">
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className={k < gone ? 'bar gone' : 'bar'} />
      ))}
    </span>
  );
}

/** The scene builder `shellPane` of the Mockup. The `.bak` row exists in the copy only. */
export function ShellPane(props: ShellPaneProps) {
  const { scene } = props;
  const state = props.side === 'copy' ? props.state : null;
  const dbName = scene.files.find((f) => f.endsWith('.db')) ?? 'app.db';
  const others = scene.files.filter((f) => f !== dbName);
  let i = 0;
  return (
    <div className="tree">
      <div className="node" style={idx(i++)}>
        <Icon id="i-folder" viewBox="0 0 24 24" />
        {scene.root}
      </div>
      <div className="node l1" style={idx(i++)}>
        <Icon id="i-db" viewBox="0 0 24 24" />
        {dbName}
      </div>
      {scene.tables.map((t) => {
        const isUsers = t.name === 'users';
        const live = state !== null && isUsers;
        const cls = live && state.usersClass !== 'none' ? `tbl l2 ${state.usersClass}` : 'tbl l2';
        return (
          <div className={cls} data-t={t.name} key={t.name} style={idx(i++)}>
            <span className="tn">{t.name}</span>
            <Bars name={t.name} gone={live ? state.usersBarsGone : 0} />
            <span className="cnt">{formatCount(live ? state.usersCount : t.rows)}</span>
            {isUsers ? <span className="tag">{live ? state.usersTag : ''}</span> : null}
          </div>
        );
      })}
      {state !== null ? (
        <div className={state.bakShown ? 'node l1 bak show' : 'node l1 bak'} style={idx(i++)}>
          <Icon id="i-file" viewBox="0 0 24 24" />
          {dbName}.bak <span className="new">new</span>
        </div>
      ) : null}
      {others.map((f) => (
        <div className="node l1" key={f} style={idx(i++)}>
          <Icon id={f.endsWith('/') ? 'i-folder' : 'i-file'} viewBox="0 0 24 24" />
          {f}
        </div>
      ))}
    </div>
  );
}
