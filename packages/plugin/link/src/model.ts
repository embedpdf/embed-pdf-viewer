/** The link slice: loaded links per page, keyed by page object number. */
import type { PageRef } from '@embedpdf/core';

import type { Link } from './contract';

export interface LinkState {
  pages: Record<number, readonly Link[]>;
}
export type LinkAction =
  | { type: 'setPage'; page: PageRef; items: readonly Link[] }
  | { type: 'dropPage'; page: PageRef };

export const initialLinkState = (): LinkState => ({ pages: {} });

export function linkReducer(state: LinkState, a: LinkAction): LinkState {
  switch (a.type) {
    case 'setPage':
      return { ...state, pages: { ...state.pages, [a.page.pageObjectNumber]: a.items } };
    case 'dropPage': {
      const pon = a.page.pageObjectNumber;
      if (!(pon in state.pages)) return state;
      const pages = { ...state.pages };
      delete pages[pon];
      return { ...state, pages };
    }
  }
}
