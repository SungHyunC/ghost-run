import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BlacklightViewMarkup } from '../../src/components/BlacklightView';
import { CandleView } from '../../src/components/Candle';
import { GraveyardView } from '../../src/components/Graveyard';
import { MirrorWorldView } from '../../src/components/MirrorWorld';
import { Placeholder, type ComponentName } from '../../src/components/Placeholder';
import { RedThreadViewMarkup } from '../../src/components/RedThreadView';
import { SeanceMarkup } from '../../src/components/SeanceView';
import { buildCandleModel } from '../../src/model/candle';
import { buildClaimModel } from '../../src/model/claims';
import { buildGraveyardModel } from '../../src/model/graveyard';
import { buildMirrorModel } from '../../src/model/mirror';
import { buildSeanceModel } from '../../src/model/seance';
import * as texts from '../../src/model/texts';
import { renderMarkup } from '../support/markup';

// Fixed-text pins. Literals come from requirements.md, not from the code.
// Validates: Requirements 5.12, 5.13, 6.1, 6.12, 7.3, 7.8, 8.11, 9.9, 10.8, 10.11, 14.1

const NO_REVEAL = { lines: new Set<number>(), findings: new Set<number>() };

function candleHtml(verdict: unknown, claims: unknown = undefined): string {
  const model = buildCandleModel(verdict);
  if (model.kind !== 'ok') throw new Error('unreadable');
  return renderMarkup(<CandleView model={model} claims={buildClaimModel(claims)} />);
}

function mirrorHtml(input: unknown): string {
  const model = buildMirrorModel(input);
  if (model.kind !== 'ok') throw new Error('unreadable');
  return renderMarkup(
    <MirrorWorldView model={model} revealAll={false} sceneOpen={false} sceneRevealAll={false} />,
  );
}

/** Collect every string a texts.ts export can produce (functions are called with sample arguments). */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...a: unknown[]) => unknown;
    for (const args of [['x1', 'y1'], [3, 4], [true], [['P1', 'P5']]]) {
      try {
        out.push(String(fn(...args)));
      } catch {
        // The sample arguments do not fit this builder; another sample will.
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
}

function sourceFiles(dir: URL): URL[] {
  const found: URL[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...sourceFiles(new URL(`${entry.name}/`, dir)));
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(new URL(entry.name, dir));
  }
  return found;
}

describe('candle literals (Requirement 6 criterion 1)', () => {
  const table: Array<[unknown, string, string, string]> = [
    [{ verdict: 'pass' }, 'lit', 'PASS', 'Candle lit: pass. All wards cleared.'],
    [{ verdict: 'warn' }, 'flickering', 'WARN', 'Candle flickering: warn. Human approval needed.'],
    [{ verdict: 'block' }, 'out', 'BLOCK', 'Candle out: block.'],
    [{ verdict: 'mystery' }, 'unknown', 'UNKNOWN', 'Candle state unknown: verdict not recognized.'],
    [{}, 'idle', 'NO VERDICT', 'No verdict yet.'],
  ];
  for (const [verdict, state, label, accessible] of table) {
    it(`renders ${state} with its label and accessible label`, () => {
      const html = candleHtml(verdict);
      expect(html).toContain(`data-candle-state="${state}"`);
      expect(html).toContain(`>${label}<`);
      expect(html).toContain(`aria-label="${accessible}"`);
      expect(html).toContain(`>${accessible}<`);
    });
  }

  it('pins the ward and inconsistency literals', () => {
    expect(candleHtml({ verdict: 'block', violations: [] })).toContain('Violated ward: none reported');
    const html = candleHtml({
      verdict: 'pass',
      violations: [{ wardId: 'protect-env', wardKind: 'path', reason: 'delete of .env' }],
    });
    expect(html).toContain('Violated ward: protect-env (path)');
    expect(html).toContain('protect-env: delete of .env');
    expect(html).toContain('Data inconsistent: pass verdict with violations.');
  });

  it('shows the idle candle without a verdict as No verdict yet (Requirement 14 criterion 1)', () => {
    expect(candleHtml({})).toContain('No verdict yet.');
  });
});

describe('notices of any kind (Requirement 6 criteria 5 and 6)', () => {
  it('renders each notice as step <n>: <reason> and counts them, whatever the kind', () => {
    const notices = [
      { stepIndex: 0, kind: 'unsupported-step', reason: 'shell glob not rehearsed' },
      { stepIndex: 2, kind: 'path-escape', reason: 'path leaves the copy' },
      { stepIndex: 5, kind: 'content-inspection', reason: 'canary found in output' },
    ];
    const html = candleHtml({ verdict: 'warn', violations: [], notices });
    expect(html).toContain('step 0: shell glob not rehearsed');
    expect(html).toContain('step 2: path leaves the copy');
    expect(html).toContain('step 5: canary found in output');
    expect(html).toContain(`${notices.length} notices need review`);
    for (const kind of ['unsupported-step', 'path-escape', 'content-inspection']) {
      expect(html).not.toContain(kind);
    }
  });
});

describe('claim literals (Requirement 7)', () => {
  it('pins the Assurance_Text of both sealed-capable modes', () => {
    const docker = candleHtml(
      { verdict: 'pass' },
      { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: true },
    );
    expect(docker).toContain('Ghost ran inside a sealed Docker box (P1 claimed).');
    expect(docker).not.toContain('in-memory copy');
    const playground = candleHtml(
      { verdict: 'pass' },
      { mode: 'playground', p1Claimed: true, p5Claimed: true, p6Claimed: true },
    );
    expect(playground).toContain('Ghost ran on an in-memory copy in this browser (P1 claimed).');
    expect(playground).not.toContain('sealed Docker box');
  });

  it('pins the static banner and the reason suffixes', () => {
    const banner = 'Static analysis only: no ghost rehearsal took place. P1, P5 and P6 are NOT claimed for this run.';
    const base = { mode: 'static-analysis', p1Claimed: false, p5Claimed: false, p6Claimed: false };
    expect(candleHtml({ verdict: 'warn' }, base)).toContain(banner);
    expect(candleHtml({ verdict: 'warn' }, { ...base, reason: 'docker-unavailable' })).toContain(
      `${banner} Reason: Docker unavailable.`,
    );
    expect(candleHtml({ verdict: 'warn' }, { ...base, reason: 'box-image-missing' })).toContain(
      `${banner} Reason: box image missing.`,
    );
  });

  it('pins the not-claimed banner, unknown status, and lowered-claim wording', () => {
    const unknown = candleHtml({ verdict: 'pass' }, undefined);
    expect(unknown).toContain('Isolation status unknown.');
    expect(unknown).toContain('Not claimed for this run: P1, P5, P6.');
    const sealed = { mode: 'docker-box', p1Claimed: true, p5Claimed: true, p6Claimed: false };
    expect(candleHtml({ verdict: 'pass' }, sealed)).toContain('Not claimed for this run: P6.');
    expect(candleHtml({ verdict: 'pass' }, { ...sealed, reason: 'static-analysis' })).toContain(
      'Not claimed for this run: P6. No rehearsal took place.',
    );
    expect(candleHtml({ verdict: 'pass' }, { ...sealed, reason: 'unsupported-step' })).toContain(
      'Not claimed for this run: P6. Some steps were not rehearsed.',
    );
    const na = candleHtml({ verdict: 'pass' }, { ...sealed, p6Claimed: false, notApplicable: ['P6'] });
    expect(na).toContain('P6: not applicable to this world');
  });
});

describe('words absent from fixed texts (Requirement 6 criterion 12, Requirement 7 criterion 8)', () => {
  it('Candle fixed texts never contain approved or safe', () => {
    const candleTexts: string[] = [];
    for (const v of [
      texts.CANDLE_LABELS,
      texts.NO_VIOLATIONS_REPORTED,
      texts.DATA_INCONSISTENT,
      texts.violatedWard,
      texts.violationItem,
      texts.noticeItem,
      texts.noticesNeedReview,
    ]) {
      collectStrings(v, candleTexts);
    }
    expect(candleTexts.length).toBeGreaterThan(10);
    for (const t of candleTexts) expect(t).not.toMatch(/approved|safe/i);
  });

  it('rendered Candle markup of every state contains neither approved nor safe', () => {
    for (const verdict of [{ verdict: 'pass' }, { verdict: 'warn' }, { verdict: 'block' }, { verdict: 'x' }, {}]) {
      expect(candleHtml(verdict)).not.toMatch(/approved|safe/i);
    }
  });

  it('sealed and isolated occur only in the two Assurance_Text constants', () => {
    const allowed = new Set<string>([texts.ASSURANCE_DOCKER, texts.ASSURANCE_PLAYGROUND]);
    const all: string[] = [];
    for (const v of Object.values(texts)) collectStrings(v, all);
    expect(all.length).toBeGreaterThan(50);
    for (const t of all) {
      if (!allowed.has(t)) expect(t).not.toMatch(/sealed|isolated/i);
    }
    // Text constants held by components and other model files.
    for (const file of sourceFiles(new URL('../../src/', import.meta.url))) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const lines = code.split('\n').filter((l) => /sealed|isolated/i.test(l));
      const name = file.pathname.split('/src/')[1] ?? file.pathname;
      if (name === 'model/texts.ts') {
        for (const l of lines) expect(l).toMatch(/ASSURANCE_(DOCKER|PLAYGROUND)/);
      } else {
        expect(lines, name).toEqual([]);
      }
    }
  });
});

describe('no unchanged-reality statement (Requirement 5 criterion 13)', () => {
  const claimsLike = /reality[^.<>]*(unchanged|untouched|not changed|intact|safe)|(unchanged|untouched)[^.<>]*reality/i;

  it('Candle texts and markup do not state that reality is unchanged', () => {
    const all: string[] = [];
    collectStrings(texts.CANDLE_LABELS, all);
    for (const v of [texts.NO_VIOLATIONS_REPORTED, texts.DATA_INCONSISTENT]) all.push(v);
    for (const t of all) expect(t).not.toMatch(claimsLike);
    for (const verdict of [{ verdict: 'pass' }, { verdict: 'warn' }, { verdict: 'block' }, {}]) {
      expect(candleHtml(verdict)).not.toMatch(claimsLike);
    }
  });

  it('Mirror texts and markup do not state that reality is unchanged', () => {
    const all: string[] = [
      texts.MIRROR_TITLE,
      texts.MIRROR_TABLE_LABEL,
      texts.MIRROR_REALITY,
      texts.MIRROR_COPY,
      texts.EMPTY_MIRROR,
      texts.mirrorSummary(0, 1),
      texts.WOULD_BE_REMOVED,
      texts.UNRECOGNIZED_CHANGE,
      texts.FULL_SCENE,
    ];
    for (const t of all) expect(t).not.toMatch(claimsLike);
    expect(mirrorHtml({ changes: [] })).not.toMatch(claimsLike);
    expect(mirrorHtml({ changes: [[{ kind: 'file-created', path: '/w/a.txt' }]] })).not.toMatch(claimsLike);
  });
});

describe('mirror, blacklight, red thread, graveyard literals', () => {
  it('pins the Mirror headings, summary, and empty text', () => {
    const html = mirrorHtml({ changes: [] });
    expect(html).toContain('>Reality<');
    expect(html).toContain('>Mirror (copy)<');
    expect(html).toContain('0 changes in 0 steps');
    expect(html).toContain('No changes: the ghost run left the mirror unchanged.');
    const some = mirrorHtml({
      changes: [[{ kind: 'file-deleted', path: '/w/a.txt' }, { kind: 'weird', note: 'x' }]],
    });
    expect(some).toContain('2 changes in 1 steps');
    expect(some).toContain('would be removed');
    expect(some).toContain('unrecognized change');
  });

  it('pins the Blacklight texts and empty states', () => {
    const none = renderMarkup(<BlacklightViewMarkup sources={[]} mode="off" reveal={NO_REVEAL} />);
    expect(none).toContain('No texts to scan.');
    expect(none).toContain('Text analysis does not catch every injection.');
    expect(none).toContain('Blacklight: off');
    const empty = renderMarkup(
      <BlacklightViewMarkup
        sources={[{ source: 'notes.example.txt', text: 'plain', scan: { findings: [] } }]}
        mode="on"
        reveal={NO_REVEAL}
      />,
    );
    expect(empty).toContain('No hidden text found by the blacklight.');
    expect(empty).toContain('notes.example.txt: 0 findings');
    expect(empty).toContain('Blacklight: on');
    expect(empty).toContain('Text analysis does not catch every injection.');
    expect(texts.UNPLACED_FINDINGS).toBe('Findings that could not be placed');
  });

  it('pins the Red thread texts and empty state', () => {
    expect(renderMarkup(<RedThreadViewMarkup needles={[]} links={[]} />)).toContain(
      'No addresses or paths to trace.',
    );
    const needle = { value: '/etc/none.test', origin: 'observed-path' as const, stepIndex: 3 };
    const html = renderMarkup(
      <RedThreadViewMarkup
        needles={[needle, needle]}
        links={[{ needle, status: 'not-found' }]}
      />,
    );
    expect(html).toContain('The red thread finds literal occurrences only.');
    expect(html).toContain('No cause found in the texts the agent read. Not found does not mean safe.');
    expect(html).toContain('Red thread data mismatch: 2 needles, 1 links.');
    expect(texts.HIDDEN_TEXT).toBe('hidden text');
    expect(texts.TURN_ON_BLACKLIGHT).toBe('Turn on the blacklight to reveal it.');
    expect(texts.MATCHED_HOST_KEY).toBe('matched host key');
  });

  it('pins the Graveyard texts', () => {
    const empty = buildGraveyardModel([]);
    if (empty.kind !== 'ok') throw new Error('unreadable');
    const html = renderMarkup(<GraveyardView model={empty} revealAll={false} />);
    expect(html).toContain('0 blocked commands');
    expect(html).toContain('No blocked commands yet.');
    const model = buildGraveyardModel([
      { id: 'bad id!', command: 'ls', recordedAt: 'later', wardIds: ['w1'] },
    ]);
    if (model.kind !== 'ok') throw new Error('unreadable');
    const filled = renderMarkup(<GraveyardView model={model} revealAll={false} />);
    expect(filled).toContain('1 blocked commands');
    expect(filled).toContain('time unreadable');
    expect(filled).toContain('No seance link: invalid id');
  });
});

describe('seance not-recorded lines and Placeholder', () => {
  it('shows <part> not recorded for every absent part', () => {
    const entry = { id: 'a1', command: 'ls', recordedAt: '2026-01-02T03:04:05Z', wardIds: ['w1'], detail: {} };
    const model = buildSeanceModel(entry);
    if (model.kind !== 'ok') throw new Error('unreadable');
    const html = renderMarkup(<SeanceMarkup model={model} detail={entry.detail} />);
    for (const part of ['wardVerdict', 'claims', 'changes', 'sources', 'needles', 'links']) {
      expect(html).toContain(`${part} not recorded`);
    }
    expect(html).toContain('Back to graveyard');
  });

  it('shows the Placeholder text in an alert for every component name', () => {
    const names: ComponentName[] = [
      'MirrorWorld',
      'Candle',
      'BlacklightView',
      'RedThreadView',
      'Graveyard',
      'SeanceView',
      'KitRoot',
    ];
    for (const name of names) {
      const html = renderMarkup(<Placeholder name={name} />);
      expect(html).toContain('role="alert"');
      expect(html).toContain(`Data unavailable: ${name} received unreadable input.`);
    }
  });
});
