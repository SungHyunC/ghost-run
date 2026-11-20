import { createContext, useContext } from 'react';
import { EN } from './strings';
import type { Strings } from './strings';

/** The words of the page; English unless the page provides another language. */
export const StringsContext = createContext<Strings>(EN);

export function useStrings(): Strings {
  return useContext(StringsContext);
}
