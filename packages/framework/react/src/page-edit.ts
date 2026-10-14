/**
 * The React surface for @embedpdf/plugin-page-edit. The plugin turns a page
 * relative to its rotation and resolves placements, so this file is binding
 * only:
 *
 *   const pageEdit = usePageEdit();
 *   await pageEdit.rotateBy([page.ref], 90);
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-page-edit';
import { PageEditToken, type PageEditCapability } from '@embedpdf/plugin-page-edit';
import { useCapability } from './runtime';

/**
 * The page edits of the surrounding `<DocumentScope>`'s document, else the
 * active one. Outside a document, every method throws `not-ready`.
 */
export function usePageEdit(): PageEditCapability {
  return useCapability(PageEditToken);
}
