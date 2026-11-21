// Drift test: the Showcase's sample data renders the same kit parts as the real gallery.
// Method (task 1.2 spike succeeded): the gallery entry is imported into #root; no text fallback is needed.
// **Validates: Requirements 14.2, 14.3, 14.13**
import { waitFor } from '@testing-library/dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as sample from '../../src/showcase/sample-data';
import { assertNoDrift, pickData, renderShowcaseParts } from '../lib/drift';
import type { ShowcaseData } from '../lib/drift';

const root = document.createElement('div');
root.id = 'root';
document.body.appendChild(root);

let galleryMain: HTMLElement;

beforeAll(async () => {
  // The site tsconfig does not allow a .tsx extension in import paths; Vite resolves it fine.
  // @ts-expect-error TS5097
  await import('../../../ui/gallery/main.tsx');
  await waitFor(() => {
    expect(root.querySelector('main')).not.toBeNull();
  });
  galleryMain = root.querySelector('main') as HTMLElement;
});

afterAll(() => {
  root.remove();
});

const seances = sample.entries.length;

describe('sample data against the real gallery', () => {
  it('renders every kit part like the gallery', () => {
    const { main, unmount } = renderShowcaseParts(pickData(sample));
    try {
      expect(seances).toBe(2);
      expect(() => {
        assertNoDrift(galleryMain, main, seances);
      }).not.toThrow();
    } finally {
      unmount();
    }
  });

  it('fails when one code point of a Finding changes', () => {
    const data: ShowcaseData = structuredClone(pickData(sample));
    const finding = data.blacklightSources[0]?.scan?.findings?.[0];
    if (finding === undefined) throw new Error('no finding');
    const codePoints = finding.codePoints as number[];
    codePoints[1] = (codePoints[1] ?? 0) + 1;
    const { main, unmount } = renderShowcaseParts(data);
    try {
      expect(() => {
        assertNoDrift(galleryMain, main, seances);
      }).toThrow(/Drift/);
    } finally {
      unmount();
    }
  });

  it('fails when one string of the data changes', () => {
    const data: ShowcaseData = structuredClone(pickData(sample));
    data.stepLabels[0] = `${data.stepLabels[0] ?? ''} x`;
    const { main, unmount } = renderShowcaseParts(data);
    try {
      expect(() => {
        assertNoDrift(galleryMain, main, seances);
      }).toThrow(/Drift/);
    } finally {
      unmount();
    }
  });

  it('fails when a seance string changes', () => {
    const data: ShowcaseData = structuredClone(pickData(sample));
    const e = data.entries[1];
    if (e === undefined) throw new Error('no entry');
    (e as { command: string }).command = `${e.command} x`;
    const { main, unmount } = renderShowcaseParts(data);
    try {
      expect(() => {
        assertNoDrift(galleryMain, main, seances);
      }).toThrow(/Drift/);
    } finally {
      unmount();
    }
  });
});
