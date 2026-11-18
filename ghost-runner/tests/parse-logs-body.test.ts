// Validates: Requirements 8.11, 10.4
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseHttpLog } from '../src/recorder/parse-logs.js';

const BODY = 'sk-CANARY-abc123';
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const line = (o: Record<string, unknown>): string => `${JSON.stringify({ host: 'a.example', port: 80, step: 0, ...o })}\n`;

describe('listener log body field', () => {
  it('decodes a consistent base64 body into memory-only bodies', () => {
    const r = parseHttpLog(line({ bytes: BODY.length, sha256: sha(BODY), body: Buffer.from(BODY).toString('base64') }));
    expect(r.invalidLines).toBe(0);
    expect(r.bodies).toHaveLength(1);
    expect(Buffer.from(r.bodies[0]?.body ?? []).toString()).toBe(BODY);
    expect(r.bodies[0]).toMatchObject({ stepIndex: 0, destination: 'a.example:80' });
    expect(JSON.stringify(r.captures)).not.toContain(BODY);
  });

  it('rejects, and counts as invalid, a body that is not base64 or disagrees with bytes/sha256', () => {
    const good = Buffer.from(BODY).toString('base64');
    for (const o of [
      { bytes: BODY.length, sha256: sha(BODY), body: '!!notbase64' },
      { bytes: BODY.length + 1, sha256: sha(BODY), body: good },
      { bytes: BODY.length, sha256: sha('other'), body: good },
      { bytes: BODY.length, sha256: sha(BODY), body: 42 },
    ]) {
      const r = parseHttpLog(line(o));
      expect(r.bodies).toEqual([]);
      expect(r.invalidLines).toBe(1);
    }
  });

  it('yields no body for a line without the field', () => {
    const r = parseHttpLog(line({ bytes: 0, sha256: sha('') }));
    expect(r.bodies).toEqual([]);
    expect(r.invalidLines).toBe(0);
  });
});
