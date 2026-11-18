// Example tests for traceRedThread with destinations hidden in tag characters.
// **Validates: Requirements 10.6, 13.12, 13.17**
//
// Tag characters and the flag emoji are built from code points. Hosts use reserved domains only.

import { describe, expect, it } from 'vitest';
import { traceRedThread } from '../../src/possession/red-thread.js';
import type { Needle, ProvenanceLog } from '../../src/possession/types.js';

const ENGLAND = String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);

function tags(ascii: string): string {
  return String.fromCodePoint(...Array.from(ascii, (c) => 0xe0000 + (c.codePointAt(0) as number)));
}

function needle(value: string): Needle {
  return { value, origin: 'effect', stepIndex: 0 };
}

const URL_VALUE = 'https://evil.example/collect';

describe('traceRedThread hidden destinations', () => {
  it('finds a README destination hidden in tags at the column of the first tag', () => {
    const content = '# Setup\nRun the build. ' + tags(URL_VALUE) + ' Done.';
    const log: ProvenanceLog = [{ source: 'README.md', kind: 'file', content }];
    const [link] = traceRedThread(log, [needle(URL_VALUE)]);
    expect(link).toMatchObject({
      status: 'found',
      source: 'README.md',
      kind: 'file',
      recordIndex: 0,
      line: 2,
      column: 16, // 'Run the build. ' is 15 code points
      hidden: true,
      matchedKey: 'value',
    });
  });

  it('finds a destination hidden in tags appended after a flag at the first appended tag', () => {
    const content = 'ok ' + ENGLAND + tags(URL_VALUE);
    const log: ProvenanceLog = [{ source: 'notes.txt', kind: 'other', content }];
    const [link] = traceRedThread(log, [needle(URL_VALUE)]);
    // 'ok ' is 3 code points and the flag is 7, so the first appended tag is column 11.
    expect(link).toMatchObject({ status: 'found', recordIndex: 0, line: 1, column: 11, hidden: true });
  });

  it('does not treat the flag itself as hidden text', () => {
    const log: ProvenanceLog = [{ source: 'a', kind: 'file', content: ENGLAND + ' see /etc/hosts' }];
    const [link] = traceRedThread(log, [needle('/etc/hosts')]);
    expect(link).toMatchObject({ status: 'found', hidden: false, column: 13 }); // flag (7) + ' see ' (5)
  });

  it('keeps lineText printable ASCII with hidden characters escaped', () => {
    const log: ProvenanceLog = [{ source: 'a', kind: 'file', content: 'x' + tags('/p') }];
    const [link] = traceRedThread(log, [needle('/p')]);
    expect(link?.status).toBe('found');
    if (link?.status !== 'found') return;
    expect(link.lineText).toMatch(/^[\u0020-\u007e]+$/);
    expect(link.lineText.startsWith('x<U+E002F>')).toBe(true);
  });

  it('prefers the earlier record even when a later one holds a hidden copy', () => {
    const log: ProvenanceLog = [
      { source: 'first', kind: 'web', content: 'visit ' + URL_VALUE },
      { source: 'second', kind: 'file', content: tags(URL_VALUE) },
    ];
    const [link] = traceRedThread(log, [needle(URL_VALUE)]);
    expect(link).toMatchObject({ status: 'found', recordIndex: 0, hidden: false, column: 7 });
  });
});
