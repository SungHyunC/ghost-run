// The page registry: the one source of the page order, titles, short labels, and hash names.

export type PageId = 'cover' | 'recipe' | 'costumes' | 'run' | 'make';

export interface PageInfo {
  readonly id: PageId;
  readonly title: string;
  readonly label: string;
}

export const PAGES: readonly PageInfo[] = [
  { id: 'cover', title: "Let your agent's ghost try it first", label: 'Cover' },
  { id: 'recipe', title: "What's in the skeleton?", label: 'Skeleton' },
  { id: 'costumes', title: 'One skeleton, three costumes', label: 'Costumes' },
  { id: 'run', title: 'Watch the ghost work', label: 'Ghost at work' },
  { id: 'make', title: 'Make your own costume', label: 'Your own' },
];

export const PAGE_IDS: readonly PageId[] = PAGES.map((p) => p.id);
