// Feature: ui-kit, Property 3: No hidden characters (static leg, S leg)
// **Validates: Requirements 3.3, 3.4, 3.8**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { scanText } from '@ghost-run/core';
import { BlacklightViewMarkup } from '../../src/components/BlacklightView';
import { Candle } from '../../src/components/Candle';
import { GraveyardView } from '../../src/components/Graveyard';
import { MirrorWorldView } from '../../src/components/MirrorWorld';
import { RedThreadViewMarkup } from '../../src/components/RedThreadView';
import { SeanceMarkup } from '../../src/components/SeanceView';
import { buildGraveyardModel } from '../../src/model/graveyard';
import { buildMirrorModel } from '../../src/model/mirror';
import { buildSeanceModel } from '../../src/model/seance';
import { dirtyString } from '../fixtures/arbitraries';
import { renderMarkup } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Rec = Record<string, unknown>;

// Hidden_Display_Code_Point (requirements glossary), written with escapes only.
// The Blacklight switch `on` shows hex notation, so no literal code point may reach the markup.
const HIDDEN_RE = /[\u{E0000}-\u{E007F}\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/u;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// ---------------------------------------------------------------------------
// Generator: one dirty string for every displayed field
// ---------------------------------------------------------------------------

const dirty = dirtyString(fc.string({ maxLength: 8 }));

const FIELD_NAMES = [
  'path',
  'table',
  'targetBefore',
  'targetAfter',
  'unknownKind',
  'unknownField',
  'unknownValue',
  'stepLabel',
  'sceneKey',
  'sceneValue',
  'wardId',
  'wardKind',
  'reason',
  'noticeKind',
  'noticeReason',
  'destination',
  'verdictValue',
  'source',
  'textLine',
  'rendering',
  'needleValue',
  'linkSource',
  'linkLineText',
  'actionLabel',
  'command',
  'recordedAt',
  'entryWardId',
  'entryId',
] as const;
type FieldName = (typeof FIELD_NAMES)[number];
type Fields = Record<FieldName, string>;

const fieldsArb: fc.Arbitrary<Fields> = fc
  .tuple(...FIELD_NAMES.map(() => dirty))
  .map((values) => Object.fromEntries(FIELD_NAMES.map((n, i) => [n, values[i] as string])) as Fields);

/** `{ [key]: value }` that keeps odd keys as own properties. */
function entry(key: string, value: unknown): Rec {
  const out: Rec = {};
  Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
  return out;
}

// ---------------------------------------------------------------------------
// Inputs built from the fields
// ---------------------------------------------------------------------------

function changesOf(f: Fields): unknown[][] {
  return [
    [
      { kind: 'file-created', path: f.path },
      { kind: 'file-deleted', path: f.path },
      { kind: 'symlink-changed', path: f.path, targetBefore: f.targetBefore, targetAfter: f.targetAfter },
      { kind: 'sql-row-count', table: f.table, rowsBefore: 12, rowsAfter: 3 },
      { kind: f.unknownKind, ...entry(f.unknownField, f.unknownValue) },
      { kind: 'future-kind', ...entry(f.unknownField, [f.unknownValue, { [f.sceneKey]: f.unknownValue }]) },
    ],
    [{ kind: 'file-overwritten', path: f.path }],
  ];
}

function sceneOf(f: Fields): Rec {
  return {
    ...entry(f.sceneKey, f.sceneValue),
    list: [f.sceneValue, { ...entry(f.sceneKey, f.sceneValue) }],
    nested: { ...entry(f.sceneKey, { ...entry(f.sceneKey, f.sceneValue) }) },
  };
}

function verdictOf(f: Fields, verdict: unknown): Rec {
  return {
    verdict,
    violations: [{ wardId: f.wardId, wardKind: f.wardKind, reason: f.reason }],
    notices: [
      { kind: f.noticeKind, reason: f.noticeReason, stepIndex: 1, destination: f.destination, path: f.path },
      { kind: 'effect-outside', reason: f.noticeReason, stepIndex: 0, destination: f.destination },
    ],
  };
}

function sourcesOf(f: Fields): Rec[] {
  const text = [f.textLine, f.textLine, f.source].join('\n');
  const first = {
    category: 'tag',
    line: 1,
    column: 1,
    offset: 0,
    length: 1,
    codePoints: [0xe0041],
    firstCodePoint: 'U+E0041',
    rendering: f.rendering,
  };
  return [
    { source: f.source, text, scan: { findings: [first, ...scanText(text).findings] } },
    { source: f.textLine, text: f.rendering, scan: scanText(f.rendering) },
  ];
}

function threadOf(f: Fields): { needles: Rec[]; links: Rec[]; actionLabels: string[] } {
  const needles = [
    { value: f.needleValue, origin: 'effect', stepIndex: 0 },
    { value: f.destination, origin: 'observed-path', stepIndex: 1 },
  ];
  const links = [
    {
      status: 'found',
      needle: needles[0],
      matchedKey: 'value',
      source: f.linkSource,
      kind: 'file',
      recordIndex: 0,
      line: 1,
      column: 2,
      lineText: f.linkLineText,
      hidden: true,
    },
    { status: 'not-found', needle: needles[1] },
  ];
  return { needles, links, actionLabels: [f.actionLabel, f.command] };
}

function entriesOf(f: Fields, detail: Rec): Rec[] {
  return [
    { id: f.entryId, command: f.command, recordedAt: f.recordedAt, wardIds: [f.entryWardId, f.wardId], detail },
    { id: 'safe-1', command: f.command, recordedAt: '2026-01-02T03:04:05Z', wardIds: [f.entryWardId] },
  ];
}

const claimsOf = (mode: unknown): Rec => ({
  mode,
  p1Claimed: false,
  p5Claimed: false,
  p6Claimed: false,
  reason: 'docker-unavailable',
});

function detailOf(f: Fields): Rec {
  const thread = threadOf(f);
  return {
    wardVerdict: verdictOf(f, 'block'),
    changes: changesOf(f),
    claims: claimsOf('static-analysis'),
    sources: sourcesOf(f),
    needles: thread.needles,
    links: thread.links,
    actionLabels: thread.actionLabels,
  };
}

// ---------------------------------------------------------------------------
// Rendering of every component
// ---------------------------------------------------------------------------

const ALL_INDEXES: ReadonlySet<number> = new Set(Array.from({ length: 64 }, (_, i) => i));

function renderAll(f: Fields): { name: string; html: string }[] {
  const out: { name: string; html: string }[] = [];
  const add = (name: string, html: string): void => {
    out.push({ name, html });
  };

  // MirrorWorld: limited and fully revealed, scene closed and open.
  const mirror = buildMirrorModel({
    changes: changesOf(f),
    stepLabels: [f.stepLabel, f.stepLabel],
    realScene: sceneOf(f),
    mirrorScene: sceneOf(f),
  });
  if (mirror.kind !== 'ok') throw new Error('expected an ok mirror model');
  for (const open of [false, true]) {
    add(
      `MirrorWorld scene ${open ? 'open' : 'closed'}`,
      renderMarkup(<MirrorWorldView model={mirror} revealAll={open} sceneOpen={open} sceneRevealAll={open} />),
    );
  }

  // Candle: a dirty verdict value, a known verdict, a dirty claims mode.
  add('Candle unknown verdict', renderMarkup(<Candle verdict={verdictOf(f, f.verdictValue) as never} />));
  add(
    'Candle block',
    renderMarkup(<Candle verdict={verdictOf(f, 'block') as never} claims={claimsOf(f.verdictValue) as never} />),
  );

  // Blacklight: switch off and on, nothing revealed and everything revealed.
  for (const mode of ['off', 'on'] as const) {
    for (const all of [false, true]) {
      add(
        `Blacklight ${mode} ${all ? 'revealed' : 'limited'}`,
        renderMarkup(
          <BlacklightViewMarkup
            sources={sourcesOf(f)}
            mode={mode}
            reveal={all ? { lines: ALL_INDEXES, findings: ALL_INDEXES } : { lines: new Set(), findings: new Set() }}
          />,
        ),
      );
    }
  }

  // Red thread.
  const thread = threadOf(f);
  add('RedThread', renderMarkup(<RedThreadViewMarkup needles={thread.needles as never} links={thread.links as never} actionLabels={thread.actionLabels} revealAll />));

  // Graveyard and seance.
  const entries = entriesOf(f, detailOf(f));
  const grave = buildGraveyardModel(entries);
  if (grave.kind !== 'ok') throw new Error('expected an ok graveyard model');
  add('Graveyard', renderMarkup(<GraveyardView model={grave} revealAll />));
  const seance = buildSeanceModel(entries[0]);
  if (seance.kind !== 'ok') throw new Error('expected an ok seance model');
  add('Seance', renderMarkup(<SeanceMarkup model={seance} detail={detailOf(f)} />));
  return out;
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

type Counter = ReturnType<typeof createCounter>;
type Category = 'tag' | 'zero-width' | 'bidi' | 'control' | 'surrogate';

function categoriesOf(s: string): Set<Category> {
  const seen = new Set<Category>();
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c >= 0xe0000 && c <= 0xe007f) seen.add('tag');
    else if ((c >= 0x200b && c <= 0x200d) || c === 0x2060 || c === 0xfeff) seen.add('zero-width');
    else if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) seen.add('bidi');
    else if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) seen.add('control');
  }
  if (LONE_SURROGATE_RE.test(s)) seen.add('surrogate');
  return seen;
}

function record(f: Fields, counter: Counter): void {
  for (const name of FIELD_NAMES) {
    const cats = categoriesOf(f[name]);
    if (cats.size === 0) continue;
    counter.add(`field:${name}`);
    for (const c of cats) counter.add(`category:${c}`);
  }
}

const FIELD_BUCKETS = FIELD_NAMES.map((n) => `field:${n}`);
const CATEGORY_BUCKETS = (['tag', 'zero-width', 'bidi', 'control', 'surrogate'] as const).map((c) => `category:${c}`);

describe('UI-P3 no hidden characters (static leg)', () => {
  it('UI-P3: no Hidden_Display_Code_Point reaches the markup of any component', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter = createCounter('UI-P3 static');
    fc.assert(
      fc.property(fieldsArb, (f) => {
        record(f, counter);
        const views = renderAll(f);
        // One expect per view, not per character.
        const leaks = views.filter((v) => HIDDEN_RE.test(v.html)).map((v) => v.name);
        expect(leaks).toEqual([]);
        // Non-vacuity: dirty text was rendered, as hex notation (React writes `<` as `&lt;`).
        if (views.some((v) => v.html.includes('&lt;U+'))) counter.add('hex-in-markup');
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [...FIELD_BUCKETS, ...CATEGORY_BUCKETS, 'hex-in-markup']);
  }, PBT_TIMEOUT);

  it('UI-P3: example, one hidden character in a path and a command', () => {
    const f = Object.fromEntries(FIELD_NAMES.map((n) => [n, `a${String.fromCodePoint(0x200b)}b`])) as Fields;
    f.path = `x${String.fromCodePoint(0xe0041)}y`;
    for (const v of renderAll(f)) expect(HIDDEN_RE.test(v.html), v.name).toBe(false);
  });
});
