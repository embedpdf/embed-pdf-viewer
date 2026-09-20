import type { LinkAction, LinkState } from './types';

export const initialLinkState = (): LinkState => ({ pages: {} });

/** Pure. Engine-backed page cache only — the annotation-backed mode reads the
 *  annotation plugin's model and never touches this state. */
export function linkReducer(state: LinkState, a: LinkAction): LinkState {
  switch (a.type) {
    case 'SET_PAGE':
      return { ...state, pages: { ...state.pages, [a.page.pageObjectNumber]: a.items } };
    case 'DROP_PAGE': {
      const pon = a.page.pageObjectNumber;
      if (!(pon in state.pages)) return state;
      const pages = { ...state.pages };
      delete pages[pon];
      return { ...state, pages };
    }
  }
}
