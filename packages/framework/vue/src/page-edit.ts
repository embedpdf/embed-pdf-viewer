/**
 * @embedpdf/vue/page-edit: the Vue view of `@embedpdf/plugin-page-edit`. The
 * plugin turns a page relative to its rotation and resolves positions, so
 * this entry is the binding only:
 *
 *   const pageEdit = usePageEdit();
 *   const { selected, canEdit } = usePageEditState();
 *   await pageEdit.rotateBy(selected.value, 90);
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-page-edit';
import { PageEditToken, pageEditState } from '@embedpdf/plugin-page-edit';
import type { PageEditCapability } from '@embedpdf/plugin-page-edit';
import { useCapability } from './runtime/capabilities';
import { stateComposable } from './state';

/**
 * The page edits of the nearest `<DocumentScope>`'s document, else the active
 * one. The object never changes; outside a document every method throws
 * `not-ready`. The pages themselves come from `usePageList()`.
 */
export function usePageEdit(): PageEditCapability {
  return useCapability(PageEditToken);
}

/**
 * The page edits' state as refs: the selected pages and whether you may edit
 * and copy pages (the page's State table, declared once in `pageEditState`).
 * With a selector, one ref for the value it picks, which updates only when
 * that value changes.
 */
export const usePageEditState = stateComposable(pageEditState);
