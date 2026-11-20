// The two dictionaries of the page: English matches the fixed texts, Korean has every key and stays clean.
import { describe, expect, it } from 'vitest';
import { CAPTIONS } from '../../src/flow/tour';
import { EN, KO, STRINGS } from '../../src/i18n/strings';
import * as T from '../../src/texts';

function shape(v: unknown): unknown {
  if (typeof v === 'function') return 'function';
  if (Array.isArray(v)) return 'array';
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  }
  return typeof v;
}

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v !== null && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

// Zero-width, bidi controls, the BOM, and tag characters.
const HIDDEN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]|\uDB40[\uDC00-\uDC7F]/;

describe('page dictionaries', () => {
  it('English reuses the fixed texts the tests pin', () => {
    expect(EN.runGhost).toBe(T.RUN_GHOST_LABEL);
    expect(EN.applyFixedPlan).toBe(T.APPLY_FIXED_PLAN_LABEL);
    expect(EN.noRun).toBe(T.NO_RUN_TEXT);
    expect(EN.dockerBoxNotUsed).toBe(T.DOCKER_BOX_NOT_USED_TEXT);
    expect(EN.messagePanel).toBe(T.MESSAGE_PANEL_LABEL);
    expect(EN.tagline).toBe(T.APP_TAGLINE);
    expect(EN.captions).toBe(CAPTIONS);
    expect(EN.scenarioTitles).toBeUndefined();
    expect(STRINGS.en).toBe(EN);
    expect(STRINGS.ko).toBe(KO);
  });

  it('Korean has exactly the keys and kinds of English (titles aside)', () => {
    const { scenarioTitles: _en, notices: _enNotices, ...en } = EN;
    const { scenarioTitles: ko, notices, ...rest } = KO;
    expect(shape(rest)).toEqual(shape(en));
    expect(Object.keys(ko ?? {}).sort()).toEqual(['1', '2', '3', '4', '5']);
    // The Korean notices translate the English notice texts the page state holds.
    expect(Object.keys(notices).sort()).toEqual([T.EMPTY_PLAN_TEXT, T.RUN_FAILED_TEXT].sort());
  });

  it('Korean words hold no hidden character and make no isolation or safety claim', () => {
    const all = strings(KO);
    expect(all.length).toBeGreaterThan(100);
    for (const s of all) {
      expect(s).not.toMatch(HIDDEN);
      expect(s).not.toMatch(/격리|봉인|밀폐|밀봉|안전/);
      expect(s).not.toMatch(/sealed|isolated/i);
    }
  });

  it('the caption builders keep the command and the reason', () => {
    expect(KO.captions.runPlan('npm test', 0)).toBe('에이전트의 계획: npm test');
    expect(KO.captions.runPlan('rm -rf ./build', 2)).toBe('에이전트의 계획: rm -rf ./build (외 2개)');
    expect(KO.captions.runJudge('no-data-loss: x')).toBe('결계 판정: no-data-loss: x');
    expect(EN.captions.runPlan('npm test', 1)).toBe('The agent plans: npm test (+1 more)');
  });

  it('each page links to the other', () => {
    expect([EN.switchHref, EN.switchLang]).toEqual(['./ko.html', 'ko']);
    expect([KO.switchHref, KO.switchLang]).toEqual(['./', 'en']);
  });
});
