import type { FormFieldRef, FormMutationMeta, FormWidget } from '@embedpdf/engine-core/runtime';
import type { DocumentSession } from '../../../document-session/DocumentSession';

/**
 * The meta of a form write: the fields and widgets it changed, and the pages
 * those widgets sit on. Unplaced widgets name no page. Form writes never
 * change the page list, so there is no cache delta.
 */
export function formMutationMeta(
  session: DocumentSession,
  changedFields: FormFieldRef[],
  changedWidgets: FormWidget[],
): FormMutationMeta {
  const pages = new Set<number>();
  for (const widget of changedWidgets) {
    if (widget.page) pages.add(widget.page.pageObjectNumber);
  }
  return {
    affectedPages: [...pages].map((pageObjectNumber) => session.pageState(pageObjectNumber)),
    cacheDelta: null,
    changedFields,
    changedWidgets,
  };
}
