import { afterAll, expect, it } from 'vitest';
import { waitFor } from '@testing-library/dom';

// Spike for the drift test (design Component 9): can the real gallery entry run in jsdom?
const root = document.createElement('div');
root.id = 'root';
document.body.appendChild(root);

afterAll(() => {
  root.remove();
});

it('imports the real gallery and renders candles and tables', async () => {
  const start = performance.now();
  // The site tsconfig does not allow a .tsx extension in import paths; Vite resolves it fine.
  // @ts-expect-error TS5097
  await import('../../../ui/gallery/main.tsx');
  await waitFor(() => {
    expect(root.querySelector('main')).not.toBeNull();
  });
  const ms = Math.round(performance.now() - start);
  console.info(`gallery import and first render: ${String(ms)} ms`);
  expect(root.querySelectorAll('section.gk-candle').length).toBeGreaterThanOrEqual(1);
  expect(root.querySelectorAll('table.gk-table').length).toBeGreaterThanOrEqual(1);
});
