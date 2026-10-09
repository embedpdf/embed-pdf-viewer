/**
 * @embedpdf/vue/page-edit: the Vue view of `@embedpdf/plugin-page-edit`. The
 * plugin turns a page relative to its rotation and resolves placements, so
 * this entry is the binding only:
 *
 *   const pageEdit = usePageEdit();
 *   await pageEdit.rotateBy([page.ref], 90);
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-page-edit';
import { PageEditToken } from '@embedpdf/plugin-page-edit';
import type { PageEditCapability } from '@embedpdf/plugin-page-edit';
import { useCapability } from './runtime/capabilities';

/**
 * The page edits of the nearest `<DocumentScope>`'s document, else the active
 * one. The object never changes; outside a document every method throws
 * `not-ready`. The pages themselves come from `usePageList()`.
 */
export function usePageEdit(): PageEditCapability {
  return useCapability(PageEditToken);
}
