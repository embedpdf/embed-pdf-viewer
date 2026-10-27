/**
 * The page-edit session state: which pages are selected. A plain list of
 * refs, changed only by the transitions here; the controller reads it over the
 * document's pages, so a page that went leaves the selection.
 */
import type { PageRef } from '@embedpdf/core';

export interface PageEditModel {
  /** The selected pages, in the order they were selected. */
  readonly selected: readonly PageRef[];
}

export const initialPageEditModel = (): PageEditModel => ({ selected: [] });

/** The selection becomes `refs`, each page once. */
export function selected(state: PageEditModel, refs: readonly PageRef[]): PageEditModel {
  const numbers = refs.map((ref) => ref.objectNumber);
  const unique = refs.filter((_ref, i) => numbers.indexOf(numbers[i]!) === i);
  const same =
    unique.length === state.selected.length &&
    unique.every((ref, i) => ref.objectNumber === state.selected[i]!.objectNumber);
  return same ? state : { ...state, selected: unique };
}
