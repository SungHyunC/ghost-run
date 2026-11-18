import { describe, expect, it } from 'vitest';
import { renderMessage } from '../src/judge/message.js';
import type { WardNotice, WardVerdict } from '../src/types.js';

const unsupported: WardNotice = {
  kind: 'unsupported-step',
  reason: 'step 2 could not be rehearsed',
  stepIndex: 2,
};
const sameReasonOther: WardNotice = { ...unsupported, kind: 'effect-outside' };

describe("WardNotice kind 'unsupported-step'", () => {
  it('a warn verdict renders the same message as one with another kind and the same reason', () => {
    const withUnsupported: WardVerdict = { verdict: 'warn', violations: [], notices: [unsupported] };
    const withOther: WardVerdict = { verdict: 'warn', violations: [], notices: [sameReasonOther] };
    const msg = renderMessage(withUnsupported, { wardCount: 1 });
    expect(msg).toBe(renderMessage(withOther, { wardCount: 1 }));
    expect(msg).toContain('1 notice(s)');
    expect(msg).toContain(unsupported.reason);
  });

  it('a pass verdict with the notice renders the same message as one without it', () => {
    const bare: WardVerdict = { verdict: 'pass', violations: [], notices: [] };
    const noisy: WardVerdict = { verdict: 'pass', violations: [], notices: [unsupported] };
    expect(renderMessage(noisy, { wardCount: 2 })).toBe(renderMessage(bare, { wardCount: 2 }));
  });
});
