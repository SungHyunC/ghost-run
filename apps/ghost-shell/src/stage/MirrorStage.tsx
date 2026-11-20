// The mirror stage: reality on the left, the ghost's copy on the right, and what left the copy.
// A picture of the run for sighted readers; the kit Mirror World table under it is the accessible record,
// so this block is aria-hidden. The vanishing plays once, when the stage scrolls into view.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlaygroundRun } from '../pipeline/run-playground';
import { useStrings } from '../i18n/context';
import { escapeForDisplay } from '../ui-imports';
import { GhostMark } from '../screens/GhostMark';
import { barsFor, barsLeft, buildStage } from './stage-model';
import type { StageEntry, StageModel, StageTable } from './stage-model';

export interface MirrorStageProps {
  readonly run: PlaygroundRun;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

function Ico({ children }: { readonly children: ReactNode }) {
  return (
    <svg className="ms-svg" viewBox="-12 -12 24 24" focusable="false">
      {children}
    </svg>
  );
}

function EntryIcon({ entry }: { readonly entry: StageEntry }) {
  if (entry.kind === 'directory') {
    return (
      <Ico>
        <path d="M-10 -6 H-3 L-1 -8 H10 V8 H-10 Z" />
      </Ico>
    );
  }
  if (entry.database) {
    return (
      <Ico>
        <ellipse cx={0} cy={-6} rx={8} ry={3} />
        <path d="M-8 -6 V6 A8 3 0 0 0 8 6 V-6" />
        <path d="M-8 0 A8 3 0 0 0 8 0" />
      </Ico>
    );
  }
  if (entry.secretRead) {
    return (
      <Ico>
        <circle cx={-4} cy={0} r={4.5} />
        <path d="M0.5 0 H10 M6 0 V4 M9 0 V3" />
      </Ico>
    );
  }
  return (
    <Ico>
      <path d="M-7 -10 H3 L8 -5 V10 H-7 Z" />
      <path d="M3 -10 V-5 H8" />
    </Ico>
  );
}

function Smoke() {
  return (
    <svg className="ms-smoke" viewBox="0 0 40 30" focusable="false">
      <path d="M8 26 C2 20 14 16 8 10 C4 6 10 2 8 0" />
      <path d="M20 28 C14 22 26 18 20 12 C16 8 22 4 20 2" />
      <path d="M32 26 C26 20 38 16 32 10" />
    </svg>
  );
}

function Tree({ model, side }: { readonly model: StageModel; readonly side: 'real' | 'copy' }) {
  const t = useStrings().stage;
  const entries = side === 'real' ? model.entries.filter((e) => e.inReality) : model.entries;
  return (
    <ul className="ms-tree">
      {entries.map((e) => {
        const status = side === 'copy' ? e.status : 'same';
        const secret = side === 'copy' && e.secretRead;
        return (
          <li
            key={e.path}
            className="ms-entry"
            data-status={status}
            data-depth={Math.min(e.depth, 3)}
            data-kind={e.kind}
            data-db={e.database}
            data-secret={secret}
          >
            <span className="ms-ico">
              <EntryIcon entry={side === 'copy' ? e : { ...e, secretRead: false }} />
            </span>
            <span className="ms-path gs-mono">
              {escapeForDisplay(e.name)}
              {e.kind === 'directory' ? '/' : ''}
            </span>
            {status !== 'same' ? <span className="ms-tag">{t.statusTag[status]}</span> : null}
            {secret ? <span className="ms-tag ms-tag-secret">{t.secretTag}</span> : null}
            {status === 'deleted' ? <Smoke /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function TableCard({ table, side }: { readonly table: StageTable; readonly side: 'real' | 'copy' }) {
  const t = useStrings().stage;
  const total = Math.max(barsFor(table.before), barsFor(table.after));
  const kept = side === 'real' ? barsFor(table.before) : barsLeft(table.before, table.after);
  const rows = side === 'real' ? table.before : table.after;
  const lost = table.before - table.after;
  const bars = Array.from({ length: total }, (_, i) => i);
  return (
    <div className="ms-table" data-lost={side === 'copy' && lost > 0} data-gained={side === 'copy' && lost < 0}>
      <p className="ms-table-name">
        <span className="ms-ico">
          <Ico>
            <ellipse cx={0} cy={-6} rx={8} ry={3} />
            <path d="M-8 -6 V6 A8 3 0 0 0 8 6 V-6" />
            <path d="M-8 0 A8 3 0 0 0 8 0" />
          </Ico>
        </span>
        <span className="gs-mono ms-db">{escapeForDisplay(table.database)}</span>
        <span className="gs-mono ms-tname">{escapeForDisplay(table.name)}</span>
      </p>
      <div className="ms-rows">
        {bars.map((i) => (
          <span key={i} className="ms-bar" data-lost={i >= kept} />
        ))}
        {side === 'copy' && lost > 0 ? <Smoke /> : null}
      </div>
      <p className="ms-count">
        <span className="ms-num gs-mono">{fmt(rows)}</span> {t.rowsWord}
        {side === 'copy' && lost > 0 ? (
          <span className="ms-lost gs-mono">
            {`-${fmt(lost)}`}
            {table.dropped ? `, ${t.tableDropped}` : ''}
          </span>
        ) : null}
        {side === 'copy' && lost < 0 ? <span className="ms-gain gs-mono">{`+${fmt(-lost)}`}</span> : null}
      </p>
    </div>
  );
}

function Pane({ model, side }: { readonly model: StageModel; readonly side: 'real' | 'copy' }) {
  const t = useStrings().stage;
  return (
    <div className={`ms-pane ms-${side}`}>
      <div className="ms-pane-head">
        <p className="ms-pane-title">{side === 'real' ? t.realTitle : t.copyTitle}</p>
        <p className="ms-pane-sub">{side === 'real' ? t.realSub : t.copySub}</p>
      </div>
      <Tree model={model} side={side} />
      {model.tables.length > 0 ? (
        <div className="ms-tables">
          {model.tables.map((t) => (
            <TableCard key={`${t.database}::${t.name}`} table={t} side={side} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MirrorStage({ run }: MirrorStageProps) {
  const t = useStrings().stage;
  const model = useMemo(() => {
    const snaps = run.report.snapshots;
    return buildStage({
      before: snaps[0]?.state,
      after: snaps[snaps.length - 1]?.state,
      changes: run.report.changes.flat(),
      events: run.report.observedEvents,
      effects: run.report.effectsOutside.flat(),
    });
  }, [run]);

  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    if (typeof IntersectionObserver !== 'function') {
      setPlay(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) {
          setPlay(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, []);

  const hasEgress = model.egress.length > 0;
  // Rows lost or gained lead the picture; otherwise the file tree does.
  const focus = model.tables.some((t) => t.before !== t.after || t.dropped) ? 'tables' : 'files';
  return (
    <div
      ref={ref}
      className="ms"
      aria-hidden="true"
      data-play={play}
      data-verdict={run.verdict}
      data-egress={hasEgress}
      data-focus={focus}
    >
      <Pane model={model} side="real" />
      <div className="ms-bridge">
        <GhostMark className="ms-bridge-mark" />
        <span className="ms-bridge-arrow" />
      </div>
      <Pane model={model} side="copy" />
      {hasEgress ? (
        <>
          <div className="ms-wire" data-verdict={run.verdict}>
            <span className="ms-wire-line" />
            <span className="ms-spark" />
            <span className="ms-wall">{run.verdict === 'block' ? 'X' : '!'}</span>
          </div>
          <div className="ms-outside" data-verdict={run.verdict}>
            <p className="ms-pane-title">{t.outsideTitle}</p>
            {model.egress.map((e) => (
              <div key={e.destination} className="ms-host">
                <span className="ms-ico ms-cloud">
                  <Ico>
                    <path d="M-8 6 H7 A5 5 0 0 0 6 -4 A7 7 0 0 0 -7 -2 A4.5 4.5 0 0 0 -8 6 Z" />
                  </Ico>
                </span>
                <span className="gs-mono ms-dest">{escapeForDisplay(e.destination)}</span>
                {e.secrets.length > 0 ? (
                  <span className="ms-carry">
                    {t.afterReadPrefix}
                    <span className="gs-mono">{escapeForDisplay(e.secrets.join(', '))}</span>
                    {t.afterReadSuffix}
                  </span>
                ) : null}
              </div>
            ))}
            <p className="ms-stamp" data-verdict={run.verdict}>
              {t.stamp[run.verdict]}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
