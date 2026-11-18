// Feature: ui-kit, Property 5: Markup inertness
// **Validates: Requirements 4.2, 4.3**
//
// Open Question Q3 decision: `renderToStaticMarkup` from `react-dom/server` is called directly inside the
// jsdom environment (see tests/support/markup.ts), so the Testing Library fallback is not needed.
// Each render is parsed into a `template` element and the DOM is checked.
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
import { parseUtcInstant } from '../../src/model/time';
import { markupString } from '../fixtures/arbitraries';
import { parseToTemplate, renderMarkup } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';

type Rec = Record<string, unknown>;

// Hidden_Display_Code_Point (requirements glossary), written with escapes only.
// The Blacklight switch `on` shows hex notation, so no literal code point may reach the markup.

// ---------------------------------------------------------------------------
// Generator: one dirty string for every displayed field
// ---------------------------------------------------------------------------

const dirty = markupString;

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

function sourcesOf(f: Fields, scanFrom: Fields): Rec[] {
  const text = [f.textLine, f.textLine, f.source].join('\n');
  const scanText0 = [scanFrom.textLine, scanFrom.textLine, scanFrom.source].join('\n');
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
    { source: f.source, text, scan: { findings: [first, ...scanText(scanText0).findings] } },
    { source: f.textLine, text: f.rendering, scan: scanText(scanFrom.rendering) },
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

function detailOf(f: Fields, scanFrom: Fields): Rec {
  const thread = threadOf(f);
  return {
    wardVerdict: verdictOf(f, 'block'),
    changes: changesOf(f),
    claims: claimsOf('static-analysis'),
    sources: sourcesOf(f, scanFrom),
    needles: thread.needles,
    links: thread.links,
    actionLabels: thread.actionLabels,
  };
}

// ---------------------------------------------------------------------------
// Rendering of every component
// ---------------------------------------------------------------------------

const ALL_INDEXES: ReadonlySet<number> = new Set(Array.from({ length: 64 }, (_, i) => i));

function renderAll(f: Fields, scanFrom: Fields = f): { name: string; html: string }[] {
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
            sources={sourcesOf(f, scanFrom)}
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
  const entries = entriesOf(f, detailOf(f, scanFrom));
  const grave = buildGraveyardModel(entries);
  if (grave.kind !== 'ok') throw new Error('expected an ok graveyard model');
  add('Graveyard', renderMarkup(<GraveyardView model={grave} revealAll />));
  const seance = buildSeanceModel(entries[0]);
  if (seance.kind !== 'ok') throw new Error('expected an ok seance model');
  add('Seance', renderMarkup(<SeanceMarkup model={seance} detail={detailOf(f, scanFrom)} />));
  return out;
}

// ---------------------------------------------------------------------------
// Inertness check
// ---------------------------------------------------------------------------

const ALLOWED_ELEMENTS = new Set([
  'div', 'section', 'h2', 'h3', 'h4', 'p', 'span', 'code', 'mark', 'ol', 'ul', 'li', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'button', 'svg', 'path', 'circle', 'rect', 'title',
]);
const ALLOWED_ATTRIBUTES = new Set([
  'class', 'hidden', 'role', 'id', 'type', 'disabled', 'scope', 'colspan', 'tabindex', 'viewbox', 'd', 'fill',
  'focusable', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'preserveaspectratio',
  'stroke-dasharray',
]);
const isAllowedAttribute = (name: string): boolean =>
  ALLOWED_ATTRIBUTES.has(name) || name.startsWith('aria-') || name.startsWith('data-') || name.startsWith('stroke');
// Whitespace and control characters, written with escapes.
const STRIP_RE = /[\s\u0000-\u001f\u007f-\u009f]/g;

interface Check {
  count: number;
  problems: string[];
}

function inspect(html: string): Check {
  const all = [...parseToTemplate(html).content.querySelectorAll('*')];
  const problems: string[] = [];
  for (const el of all) {
    const tag = el.localName;
    if (!ALLOWED_ELEMENTS.has(tag)) problems.push(`element <${tag}>`);
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) problems.push(`event attribute ${name}`);
      else if (name === 'style' || name === 'href' || name === 'src') problems.push(`forbidden attribute ${name}`);
      else if (!isAllowedAttribute(name)) problems.push(`undeclared attribute ${name}`);
      // aria-* and data-* carry display text only (an accessible name or an id) and are never read as a URL
      // or as script, so a value that merely begins with the word is not a finding there. Every other
      // attribute is checked.
      const textOnly = name.startsWith('aria-') || name.startsWith('data-');
      if (!textOnly && attr.value.replace(STRIP_RE, '').toLowerCase().startsWith('javascript:')) {
        problems.push(`javascript: value in ${name}`);
      }
    }
  }
  return { count: all.length, problems };
}

/**
 * Plain letters in place of each field: distinct, letters only. Two fields decide structure, not text:
 * an invalid id adds a "no seance link" note and an unreadable time adds a note. The plain twin keeps the
 * same validity as the hostile value so that only the markup-like characters differ. Each plain field has the
 * length of its hostile twin, and the Blacklight findings come from scanning the hostile text, because a
 * genuine finding (an HTML comment opener) is displayed by design and is not an injection effect.
 */
const plainFields = (f: Fields): Fields => {
  const letters = (n: number, text: string): string => (text + 'a'.repeat(n)).slice(0, n);
  const out = Object.fromEntries(
    FIELD_NAMES.map((n, i) => [
      n,
      letters(f[n].length, `p${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`),
    ]),
  ) as Fields;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(f.entryId)) out.entryId = 'p.id';
  if (parseUtcInstant(f.recordedAt) !== null) out.recordedAt = '2026-01-02T03:04:05Z';
  return out;
};

function checkAll(f: Fields): string[] {
  const hostile = renderAll(f);
  const plain = renderAll(plainFields(f), f);
  const issues: string[] = [];
  hostile.forEach((v, i) => {
    const got = inspect(v.html);
    for (const p of got.problems) issues.push(`${v.name}: ${p}`);
    const want = inspect((plain[i] as { html: string }).html).count;
    if (got.count !== want) issues.push(`${v.name}: element count ${got.count} != plain ${want}`);
  });
  return issues;
}

describe('UI-P5 markup inertness', () => {
  it('UI-P5: markup-like text in every displayed string stays inert in every component', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    fc.assert(
      fc.property(fieldsArb, (f) => {
        expect(checkAll(f)).toEqual([]);
      }),
      params('full'),
    );
  }, PBT_TIMEOUT ?? 0);

  it('UI-P5: example, script tag and onerror payload in every field', () => {
    const f = Object.fromEntries(
      FIELD_NAMES.map((n) => [n, '<script>x</script><img src=x onerror=alert(1)>"\' JaVaScRiPt:&amp;`']),
    ) as Fields;
    expect(checkAll(f)).toEqual([]);
  });
});
