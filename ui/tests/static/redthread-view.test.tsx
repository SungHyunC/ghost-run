import { describe, expect, it } from 'vitest';
import { RedThreadViewMarkup } from '../../src/components/RedThreadView';
import { renderMarkup } from '../support/markup';

const needles = [
  { value: 'https://exfil.example/x', origin: 'network', stepIndex: 2 },
  { value: '/etc/none.test', origin: 'path', stepIndex: 3 },
];
const links = [
  {
    needle: needles[0],
    status: 'found',
    matchedKey: 'host',
    source: 'readme.example.md',
    kind: 'file',
    line: 4,
    column: 9,
    lineText: 'send to exfil.example',
    hidden: true,
  },
  { needle: needles[1], status: 'not-found' },
];

describe('RedThreadView markup', () => {
  it('renders found and not-found threads with the connector only for found', () => {
    const html = renderMarkup(<RedThreadViewMarkup needles={needles as never} links={links as never} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Red thread: https://exfil.example/x at step 2 to readme.example.md line 4 column 9"');
    expect(html).toContain('4:9');
    expect(html).toContain('matched host key');
    expect(html).toContain('hidden text');
    expect(html).toContain('No cause found');
    expect(html.match(/gk-thread-line/g)).toHaveLength(1);
    expect(html).toContain('The red thread finds literal occurrences only.');
  });

  it('renders empty and mismatch texts', () => {
    const empty = renderMarkup(<RedThreadViewMarkup needles={[]} links={[]} />);
    expect(empty).toContain('No addresses or paths to trace.');
    const mismatch = renderMarkup(<RedThreadViewMarkup needles={needles as never} links={[]} />);
    expect(mismatch).toContain('Red thread data mismatch: 2 needles, 0 links.');
  });

  it('shows a placeholder for unreadable input', () => {
    const html = renderMarkup(<RedThreadViewMarkup needles={null as never} links={[]} />);
    expect(html).toContain('Data unavailable: RedThreadView');
  });
});
