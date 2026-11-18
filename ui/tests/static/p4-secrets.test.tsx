// Feature: ui-kit, Property 4: No secret forwarding (static leg, S leg, tag UI-P4)
// **Validates: Requirements 2.7, 4.5, 4.8, 4.9, 5.5, 5.11**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { BlacklightView } from '../../src/components/BlacklightView';
import { Candle } from '../../src/components/Candle';
import { Graveyard } from '../../src/components/Graveyard';
import { MirrorWorld, MirrorWorldView } from '../../src/components/MirrorWorld';
import { RedThreadView } from '../../src/components/RedThreadView';
import { SeanceView } from '../../src/components/SeanceView';
import { SCENE_DEPTH, UNRECOGNIZED_FIELDS } from '../../src/model/limits';
import { buildMirrorModel } from '../../src/model/mirror';
import { HIDDEN_SECRET } from '../../src/model/texts';
import type {
  BlacklightViewProps,
  CandleProps,
  GraveyardProps,
  MirrorWorldProps,
  RedThreadViewProps,
  SeanceViewProps,
} from '../../src/types';
import {
  SECRET_WORDS,
  blacklightSource,
  canary,
  change,
  claims,
  graveEntry,
  needle,
  sceneValue,
  secretLikeOracle,
  threadLink,
  unknownChange,
  wardVerdict,
} from '../fixtures/arbitraries';
import { renderMarkup } from '../support/markup';
import { PBT_SEED, PBT_TIMEOUT, params } from '../support/pbt-config';
import { assertBucketsHit, createCounter } from '../support/pbt-stats';

type Rec = Record<string, unknown>;

const CANARY_PREFIX = 'sk-CANARY-';
const EXTRA_NAMES = ['secretValues', 'payloads', 'env', 'token'] as const;
const noop = (): void => undefined;

// ---------------------------------------------------------------------------
// Part one: extra fields on valid props
// ---------------------------------------------------------------------------

/** Copy of `value` with the four extra fields added to every plain object (arrays are walked). */
function withExtras(value: unknown, canaries: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => withExtras(v, canaries));
  if (typeof value !== 'object' || value === null) return value;
  const out: Rec = {};
  for (const [k, v] of Object.entries(value as Rec)) out[k] = withExtras(v, canaries);
  EXTRA_NAMES.forEach((name, i) => {
    out[name] = canaries[i];
  });
  return out;
}

const validProps = fc.record({
  verdict: wardVerdict,
  claims,
  changes: fc.array(fc.array(change, { maxLength: 4 }), { maxLength: 3 }),
  sources: fc.array(blacklightSource, { maxLength: 2 }),
  needles: fc.array(needle, { maxLength: 3 }),
  links: fc.array(threadLink, { maxLength: 3 }),
  entries: fc.array(graveEntry, { maxLength: 3 }),
  entry: graveEntry,
});

const canaryQuad = fc.tuple(canary, canary, canary, canary);

type Counter = ReturnType<typeof createCounter>;

describe('UI-P4 no secret forwarding (static leg)', () => {
  it('UI-P4: extra fields named secretValues, payloads, env, token never reach the markup', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter: Counter = createCounter('UI-P4 part one');
    fc.assert(
      fc.property(validProps, canaryQuad, (props, quad) => {
        const canaries: readonly string[] = quad;
        const x = withExtras(props, canaries) as typeof props;
        const views: [string, string][] = [
          ['candle', renderMarkup(<Candle {...({ verdict: x.verdict, claims: x.claims, ...extrasOf(canaries) } as CandleProps)} />)],
          [
            'mirror',
            renderMarkup(
              <MirrorWorld {...({ changes: x.changes, ...extrasOf(canaries) } as unknown as MirrorWorldProps)} />,
            ),
          ],
          [
            'blacklight',
            renderMarkup(<BlacklightView {...({ sources: x.sources, ...extrasOf(canaries) } as unknown as BlacklightViewProps)} />),
          ],
          [
            'red-thread',
            renderMarkup(
              <RedThreadView
                {...({ needles: x.needles, links: x.links, ...extrasOf(canaries) } as unknown as RedThreadViewProps)}
              />,
            ),
          ],
          [
            'graveyard',
            renderMarkup(
              <Graveyard
                {...({ entries: x.entries, onOpenSeance: noop, ...extrasOf(canaries) } as unknown as GraveyardProps)}
              />,
            ),
          ],
          [
            'seance',
            renderMarkup(
              <SeanceView {...({ entry: x.entry, onBack: noop, ...extrasOf(canaries) } as unknown as SeanceViewProps)} />,
            ),
          ],
        ];
        for (const [view, html] of views) {
          counter.add(`view:${view}`);
          expect(html.includes(CANARY_PREFIX)).toBe(false);
          expect(canaries.filter((c) => html.includes(c))).toEqual([]);
        }
        for (const name of EXTRA_NAMES) counter.add(`extra:${name}`);
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      ...EXTRA_NAMES.map((n) => `extra:${n}`),
      ...['candle', 'mirror', 'blacklight', 'red-thread', 'graveyard', 'seance'].map((v) => `view:${v}`),
    ]);
  }, PBT_TIMEOUT);

  // -------------------------------------------------------------------------
  // Part two: secret-like keys in unknown changes and scenes
  // -------------------------------------------------------------------------

  it('UI-P4: secret-like keys in unknown changes and scenes are hidden, markers stay', () => {
    console.log(`PBT seed=${PBT_SEED}`);
    const counter: Counter = createCounter('UI-P4 part two');
    const scene = fc.option(sceneValue(), { nil: undefined, freq: 3 });
    const stepsArb = fc.array(fc.array(unknownChange, { maxLength: 4 }), { minLength: 1, maxLength: 3 });
    fc.assert(
      fc.property(stepsArb, scene, scene, (steps, realScene, mirrorScene) => {
        const input: Rec = { changes: steps };
        if (realScene !== undefined) input['realScene'] = realScene;
        if (mirrorScene !== undefined) input['mirrorScene'] = mirrorScene;
        const model = buildMirrorModel(input);
        if (model.kind !== 'ok') throw new Error('expected an ok model');
        const html = renderMarkup(
          <MirrorWorldView model={model} revealAll={true} sceneOpen={true} sceneRevealAll={true} />,
        );

        // (a) no canary anywhere.
        expect(html.includes(CANARY_PREFIX)).toBe(false);

        // Expected lines, from an oracle that does not use src/.
        const expectedChanges: string[] = [];
        for (const step of steps) {
          for (const el of step) expectedChanges.push(...changeLines(el as unknown as Rec, counter));
        }
        const expectedScene: string[] = [];
        if (realScene !== undefined) walkScene(realScene, null, '', 0, 0, 'scene-real', expectedScene, counter);
        if (mirrorScene !== undefined) walkScene(mirrorScene, null, '', 0, 0, 'scene-mirror', expectedScene, counter);

        // Actual lines.
        const cut = html.indexOf('gk-subheading');
        const tableHtml = cut === -1 ? html : html.slice(0, cut);
        const actualChanges = [
          ...tableHtml.matchAll(/<span>([^<]*): <\/span><code class="gk-mono">([^<]*)<\/code>/g),
        ]
          .map((m) => `${m[1] ?? ''}: ${m[2] ?? ''}`)
          .filter(interesting);
        const actualScene = [...html.matchAll(/<li class="gk-scene-entry"[^>]*>([^<]*)<\/li>/g)]
          .map((m) => m[1] ?? '')
          .filter(interesting);

        // (b) one hidden text per shown secret-like key, key still shown; (c) markers; (d) whole subtree.
        expect(actualChanges).toEqual(expectedChanges);
        expect(actualScene).toEqual(expectedScene);
        const hiddenExpected = [...expectedChanges, ...expectedScene].filter((l) => l.endsWith(HIDDEN_SECRET)).length;
        expect(html.split(HIDDEN_SECRET).length - 1).toBe(hiddenExpected);
        counter.add('view:mirror-full-scene');
      }),
      params('full'),
    );
    counter.print();
    assertBucketsHit(counter, [
      'position:change-field',
      'position:scene-real',
      'position:scene-mirror',
      'nesting:top',
      'nesting:nested',
      'view:mirror-full-scene',
      'case:mixed',
    ]);
  }, PBT_TIMEOUT);

  it('UI-P4: examples (hidden text with the key shown, nested subtree hidden)', () => {
    const c = `${CANARY_PREFIX}abc123`;
    const model = buildMirrorModel({
      changes: [[{ kind: 'future-kind', apiKey: c, note: 'visible-7' }]],
      realScene: { outer: { Password: c, other: 'visible-8' }, auth_Token: { inner: c, shown: 'visible-9' } },
    });
    if (model.kind !== 'ok') throw new Error('expected an ok model');
    const html = renderMarkup(<MirrorWorldView model={model} revealAll={true} sceneOpen={true} sceneRevealAll={true} />);
    expect(html.includes(c)).toBe(false);
    expect(html).toContain(`<span>apiKey: </span><code class="gk-mono">${HIDDEN_SECRET}</code>`);
    expect(html).toContain(`Password: ${HIDDEN_SECRET}</li>`);
    expect(html).toContain(`auth_Token: ${HIDDEN_SECRET}</li>`);
    expect(html).toContain('other: visible-8</li>');
    expect(html).toContain('>visible-7<');
    expect(html.includes('visible-9')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Oracles
// ---------------------------------------------------------------------------

function extrasOf(canaries: readonly string[]): Rec {
  const out: Rec = {};
  EXTRA_NAMES.forEach((name, i) => {
    out[name] = canaries[i];
  });
  return out;
}

const isMarker = (s: string): boolean => /^visible-\d+$/.test(s);

/** A line of the form `<key>: <value>` whose value is the hidden text or a visible marker. */
function interesting(line: string): boolean {
  if (line.endsWith(`: ${HIDDEN_SECRET}`)) return true;
  const at = line.lastIndexOf(': ');
  return at !== -1 && isMarker(line.slice(at + 2));
}

function wordOf(key: string): string {
  const k = key.toLowerCase();
  return SECRET_WORDS.find((w) => k.includes(w)) ?? 'none';
}

function countSecret(key: string, position: string, depth: number, counter: Counter): void {
  counter.add(`word:${wordOf(key)}`);
  counter.add(key === key.toLowerCase() ? 'case:lower' : key === key.toUpperCase() ? 'case:upper' : 'case:mixed');
  counter.add(`position:${position}`);
  counter.add(depth <= 1 ? 'nesting:top' : 'nesting:nested');
}

const KNOWN_PATH_KINDS = ['file-created', 'file-overwritten', 'file-deleted', 'symlink-changed'];

/** Interesting `label: text` lines of one unknown-kind change, in display order. */
function changeLines(el: Rec, counter: Counter): string[] {
  const kind = el['kind'];
  const known =
    (typeof kind === 'string' && KNOWN_PATH_KINDS.includes(kind) && typeof el['path'] === 'string') ||
    (kind === 'sql-row-count' && typeof el['table'] === 'string');
  if (known) return [];
  const out: string[] = [];
  let shown = 0;
  for (const field of Object.keys(el)) {
    if (shown >= UNRECOGNIZED_FIELDS) break;
    if (field === 'kind') continue;
    const value = el[field];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    shown += 1;
    if (secretLikeOracle(field)) {
      out.push(`${field}: ${HIDDEN_SECRET}`);
      countSecret(field, 'change-field', 1, counter);
    } else if (typeof value === 'string' && isMarker(value)) {
      out.push(`${field}: ${value}`);
    }
  }
  return out;
}

/** Interesting scene lines in pre-order. Depth limit and hiding follow the design (D13). */
function walkScene(
  value: unknown,
  secretKey: string | null,
  label: string,
  depth: number,
  keyDepth: number,
  position: string,
  out: string[],
  counter: Counter,
): void {
  const prefix = '  '.repeat(depth) + (label === '' ? '' : `${label}: `);
  if (secretKey !== null && secretLikeOracle(secretKey)) {
    out.push(`${prefix}${HIDDEN_SECRET}`);
    countSecret(secretKey, position, keyDepth, counter);
    return;
  }
  if (typeof value === 'string') {
    if (isMarker(value)) out.push(`${prefix}${value}`);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (depth >= SCENE_DEPTH) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkScene(item, null, `[${i}]`, depth + 1, keyDepth, position, out, counter));
    return;
  }
  for (const [k, v] of Object.entries(value as Rec)) {
    walkScene(v, k, k, depth + 1, depth + 1, position, out, counter);
  }
}
