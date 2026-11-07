/** The page edits' readers: the API, and the state declared once in `pageEditState`. The pages are the document's. */
import { PageEditToken, pageEditState } from '@embedpdf/plugin-page-edit';
import type { PageEditCapability } from '@embedpdf/plugin-page-edit';
import { useCapability } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';

/**
 * The page edits of the nearest `<DocumentScope>`'s document, else the active one. Outside a
 * ready document, every method throws `not-ready`. `canEdit()` and `canExtract()` are reads, so
 * `disabled={!pageEdit.canEdit()}` updates by itself.
 */
export function usePageEdit(): PageEditCapability {
  return useCapability(PageEditToken);
}

/**
 * The selected pages and whether you may edit and copy pages (the page's State table, declared
 * once in `pageEditState`), as a reactive object: `state.selected`. With a selector, the value it
 * picks as `{ current }`, which changes only when that value does.
 */
export const usePageEditState = stateReader(pageEditState);
