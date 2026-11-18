import { useCallback, useState } from 'react';
import { buildBlacklightModel } from '../model/blacklight';
import type { BlacklightModel, BlacklightReveal, MarkerModel, Segment, SourceModel } from '../model/blacklight';
import { BLACKLIGHT_DISCLAIMER, BLACKLIGHT_NAME, blacklightSwitchText } from '../model/texts';
import type { BlacklightViewProps } from '../types';
import { Icon } from './art/Icon';
import { KitBoundary } from './KitBoundary';
import { Placeholder } from './Placeholder';
import { Reveal } from './Reveal';

type Mode = 'on' | 'off';

export interface BlacklightSwitchProps {
  readonly on: boolean;
  readonly onToggle?: () => void;
}

/** Native switch. The accessible name is `Blacklight`; the visible text starts with it. */
export function BlacklightSwitch({ on, onToggle }: BlacklightSwitchProps) {
  return (
    <button type="button" role="switch" className="gk-toggle" aria-checked={on} aria-label={BLACKLIGHT_NAME} onClick={onToggle}>
      <Icon id="lamp" />
      <span>{blacklightSwitchText(on)}</span>
    </button>
  );
}

function hexText(marker: { readonly hex: readonly string[]; readonly moreCount: number }): string {
  const base = marker.hex.join(' ');
  return marker.moreCount > 0 ? `${base} +${marker.moreCount} more` : base;
}

function Marker({ marker }: { readonly marker: MarkerModel }) {
  return (
    <mark className="gk-marker" data-marker-index={marker.findingIndex}>
      <Icon id="hidden-text" />
      <span>{`${marker.category} ${marker.position} `}</span>
      <span className="gk-mono">{hexText(marker)}</span>
      {marker.rendering === '' ? null : <span className="gk-mono">{` ${marker.rendering}`}</span>}
    </mark>
  );
}

function SegmentView({ segment }: { readonly segment: Segment }) {
  return segment.kind === 'text' ? <>{segment.text}</> : <Marker marker={segment.marker} />;
}

interface SourceHandlers {
  readonly onRevealLines?: (sourceIndex: number) => void;
  readonly onRevealFindings?: (sourceIndex: number) => void;
}

function SourcePanel(props: { readonly source: SourceModel; readonly index: number } & SourceHandlers) {
  const { source, index, onRevealLines, onRevealFindings } = props;
  const shownLines = source.lines.length;
  const shownFindings = source.entries.length + source.unplaced.length + source.unreadableItems.length;
  return (
    <div role="group" aria-label={source.label} className="gk-bl-source" data-source-index={index}>
      <h3 className="gk-subheading">{source.label}</h3>
      <p className="gk-summary">{source.summary}</p>
      <ul className="gk-list gk-group">
        {source.categoryCounts.map((c) => (
          <li key={c.category} className="gk-mono" data-category={c.category}>{`${c.category}: ${c.count}`}</li>
        ))}
      </ul>
      {source.noFindingsText === null ? null : <p className="gk-empty">{source.noFindingsText}</p>}
      <ol className="gk-lines">
        {source.lines.map((line) => (
          <li key={line.number} data-line={line.number}>
            <span className="gk-line-no">{line.number}</span>
            {line.segments.map((s, i) => (
              <SegmentView key={i} segment={s} />
            ))}
          </li>
        ))}
      </ol>
      {source.linesNotice === null ? null : (
        <Reveal shown={shownLines} total={source.totalLines} noun="lines" onReveal={onRevealLines && (() => onRevealLines(index))} />
      )}
      {source.totalFindings === 0 ? null : <h4 className="gk-subheading">Findings</h4>}
      <ul className="gk-list gk-findings">
        {source.entries.map((m) => (
          <li key={m.findingIndex} data-finding-index={m.findingIndex}>
            <Marker marker={m} />
          </li>
        ))}
        {source.unreadableItems.map((t, i) => (
          <li key={`u${i}`}>{t}</li>
        ))}
      </ul>
      {source.unplaced.length === 0 ? null : (
        <div role="group" aria-label="Findings that could not be placed" className="gk-bl-unplaced">
          <h4 className="gk-subheading">Findings that could not be placed</h4>
          <ul className="gk-list">
            {source.unplaced.map((f) => (
              <li key={f.findingIndex} data-unplaced-index={f.findingIndex} className="gk-mono">
                {`${f.category} ${f.position} offset ${f.offset} length ${f.length} ${hexText(f)}${f.rendering === '' ? '' : ` ${f.rendering}`}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {source.findingsNotice === null ? null : (
        <Reveal shown={shownFindings} total={source.totalFindings} noun="findings" onReveal={onRevealFindings && (() => onRevealFindings(index))} />
      )}
    </div>
  );
}

export interface BlacklightPanelViewProps extends SourceHandlers {
  readonly model: BlacklightModel;
}

/** Pure panel markup for a built model. */
export function BlacklightPanelView({ model, onRevealLines, onRevealFindings }: BlacklightPanelViewProps) {
  return (
    <div className="gk-bl-panel">
      {model.emptyText === null ? null : <p className="gk-empty">{model.emptyText}</p>}
      {model.sources.map((source, i) => (
        <SourcePanel key={i} source={source} index={i} onRevealLines={onRevealLines} onRevealFindings={onRevealFindings} />
      ))}
      <p className="gk-note">{BLACKLIGHT_DISCLAIMER}</p>
    </div>
  );
}

export interface BlacklightMarkupProps extends SourceHandlers {
  readonly sources: unknown;
  readonly mode: Mode;
  readonly reveal: BlacklightReveal;
  readonly onToggle?: () => void;
}

/** Pure markup of the whole part for a given interaction state. */
export function BlacklightViewMarkup({ sources, mode, reveal, onToggle, onRevealLines, onRevealFindings }: BlacklightMarkupProps) {
  const model = buildBlacklightModel(sources, mode, reveal);
  if (model.kind === 'unreadable') return <Placeholder name="BlacklightView" />;
  return (
    <section className="gk-section" aria-label={BLACKLIGHT_NAME} data-blacklight={mode}>
      <div className="gk-header">
        <h2 className="gk-heading">{BLACKLIGHT_NAME}</h2>
        <BlacklightSwitch on={mode === 'on'} onToggle={onToggle} />
      </div>
      <BlacklightPanelView model={model} onRevealLines={onRevealLines} onRevealFindings={onRevealFindings} />
    </section>
  );
}

function withIndex(set: ReadonlySet<number>, index: number): ReadonlySet<number> {
  return new Set([...set, index]);
}

function BlacklightContainer({ sources }: BlacklightViewProps) {
  const [mode, setMode] = useState<Mode>('off');
  const [reveal, setReveal] = useState<BlacklightReveal>({ lines: new Set(), findings: new Set() });
  const onToggle = useCallback(() => setMode((m) => (m === 'on' ? 'off' : 'on')), []);
  const onRevealLines = useCallback((i: number) => setReveal((r) => ({ ...r, lines: withIndex(r.lines, i) })), []);
  const onRevealFindings = useCallback((i: number) => setReveal((r) => ({ ...r, findings: withIndex(r.findings, i) })), []);
  return (
    <BlacklightViewMarkup
      sources={sources}
      mode={mode}
      reveal={reveal}
      onToggle={onToggle}
      onRevealLines={onRevealLines}
      onRevealFindings={onRevealFindings}
    />
  );
}

/** The blacklight part: switch, per-source lines with markers, findings list. */
export function BlacklightView(props: BlacklightViewProps) {
  return (
    <KitBoundary name="BlacklightView">
      <BlacklightContainer {...props} />
    </KitBoundary>
  );
}
