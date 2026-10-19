/**
 * The React surface for @embedpdf/plugin-page-edit: the capability and the
 * state declared once in `pageEditState`. The plugin turns a page relative to
 * its rotation and resolves positions, so this file is binding only:
 *
 *   const pageEdit = usePageEdit();
 *   const { selected, canEdit } = usePageEditState();
 *   await pageEdit.rotateBy(selected, 90);
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-page-edit';
import { PageEditToken, pageEditState, type PageEditCapability } from '@embedpdf/plugin-page-edit';
import { useCapability } from './runtime';
import { stateHook } from './state';

/**
 * The page edits of the surrounding `<DocumentScope>`'s document, else the
 * active one. Outside a document, every method throws `not-ready`.
 */
export function usePageEdit(): PageEditCapability {
  return useCapability(PageEditToken);
}

/**
 * The page edits' state: the selected pages and whether you may edit and copy
 * pages (the page's State table, declared once in `pageEditState`). Takes a
 * selector, and re-renders only when what it returns changes.
 */
export const usePageEditState = stateHook(pageEditState);
