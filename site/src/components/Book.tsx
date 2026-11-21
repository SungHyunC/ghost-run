import type { ReactNode, RefObject, TouchEvent as ReactTouchEvent } from 'react';
import { PAGES, type PageId } from '../data/pages';
import type { PagingState } from '../engine/paging';

/** The classes of one Book_Page for the current state (design Component 5). */
export function pageClass(state: PagingState, id: PageId): string {
  if (state.leaving === null) return id === state.current ? 'page on' : 'page';
  if (state.direction === 'back') {
    if (id === state.current) return 'page enter-back';
    if (id === state.leaving) return 'page on';
    return 'page';
  }
  if (id === state.current) return 'page on fade-in';
  if (id === state.leaving) return 'page leave-next';
  return 'page';
}

export interface BookProps {
  pagesProps: {
    ref: RefObject<HTMLDivElement | null>;
    onTouchStart(e: ReactTouchEvent): void;
    onTouchEnd(e: ReactTouchEvent): void;
    onTouchCancel(e: ReactTouchEvent): void;
  };
  state: PagingState;
  /** The content of each page, by id. */
  pages: Readonly<Record<PageId, ReactNode>>;
}

export function BookPage({ id, state, children }: { id: PageId; state: PagingState; children: ReactNode }) {
  const title = PAGES.find((p) => p.id === id)?.title ?? '';
  return (
    <div className={pageClass(state, id)} data-page={id} data-title={title} inert={id !== state.current}>
      {children}
    </div>
  );
}

export function Book({ pagesProps, state, pages }: BookProps) {
  return (
    <div id="pages" className="pages" {...pagesProps}>
      {PAGES.map((p) => (
        <BookPage key={p.id} id={p.id} state={state}>
          {pages[p.id]}
        </BookPage>
      ))}
    </div>
  );
}
