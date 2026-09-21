import type { LinkAction, LinkState } from './types';

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
