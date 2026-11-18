import { useEffect } from 'react';

/** Remembers which tombstone opened a seance so focus can return to it. Holds no text, only an index. */
export interface FocusReturnStore {
  /** Record the tombstone input index that is about to open a seance. */
  remember(index: number): void;
  /** Focus the remembered tombstone, or mark the request pending when it is not in the document. */
  restore(): void;
  /** Focus the remembered tombstone when a request is pending and the element exists now. */
  consume(): void;
}

function focusTombstone(doc: Document, index: number): boolean {
  const el = doc.querySelector(`[data-tombstone-index="${String(index)}"]`);
  if (el === null || typeof (el as HTMLElement).focus !== 'function') return false;
  (el as HTMLElement).focus();
  return true;
}

/** Create a store bound to one document (or to none, for server rendering). */
export function createFocusReturnStore(doc: Document | null): FocusReturnStore {
  let remembered: number | null = null;
  let pending = false;
  const tryFocus = (): boolean => {
    if (doc === null || remembered === null) return false;
    if (!focusTombstone(doc, remembered)) return false;
    remembered = null;
    pending = false;
    return true;
  };
  return {
    remember(index) {
      remembered = Number.isInteger(index) && index >= 0 ? index : null;
      pending = false;
    },
    restore() {
      if (remembered === null) return;
      if (!tryFocus()) pending = true;
    },
    consume() {
      if (pending) tryFocus();
    },
  };
}

const stores = new WeakMap<Document, FocusReturnStore>();
const serverStore = createFocusReturnStore(null);

/** The store of the current document, created on first use. */
export function getFocusReturnStore(): FocusReturnStore {
  if (typeof document === 'undefined') return serverStore;
  let store = stores.get(document);
  if (store === undefined) {
    store = createFocusReturnStore(document);
    stores.set(document, store);
  }
  return store;
}

/** Returns the per-document store. */
export function useFocusReturn(): FocusReturnStore {
  return getFocusReturnStore();
}

/** Mount effect for the graveyard: consumes a pending focus request once it is mounted. */
export function useConsumePendingFocus(): void {
  const store = useFocusReturn();
  useEffect(() => {
    store.consume();
  }, [store]);
}
