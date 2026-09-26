/** The sibling plugins: annotation (required, host lens), selection and search (optional). */
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { SearchToken } from '@embedpdf/plugin-search/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';

import type { RedactionContext } from './context';

export function resolveSiblings(ctx: RedactionContext) {
  return {
    annotation: ctx.get(AnnotationToken),
    selection: () => ctx.tryGet(SelectionToken),
    search: () => ctx.tryGet(SearchToken),
  };
}
export type RedactionSiblings = ReturnType<typeof resolveSiblings>;
