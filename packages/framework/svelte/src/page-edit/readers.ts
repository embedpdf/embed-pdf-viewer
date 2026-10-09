/** The page edits' reader: the API. The plugin has no state of its own; the pages are the document's. */
import { PageEditToken } from '@embedpdf/plugin-page-edit';
import type { PageEditCapability } from '@embedpdf/plugin-page-edit';
import { useCapability } from '../runtime/readers.svelte';

/**
 * The page edits of the nearest `<DocumentScope>`'s document, else the active one. Outside a
 * ready document, every method throws `not-ready`. `canEdit()` and `canExtract()` are reads, so
 * `disabled={!pageEdit.canEdit()}` updates by itself.
 */
export function usePageEdit(): PageEditCapability {
  return useCapability(PageEditToken);
}
