import type { FormFieldRef, FormMutationMeta, FormWidget } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';

/**
 * The meta of a form write: the fields and widgets it changed, and the pages
 * those widgets sit on. Unplaced widgets name no page. Form writes never
 * change the page list, so there is no cache delta.
 */
export function formMutationMeta(
  changedFields: FormFieldRef[],
  changedWidgets: FormWidget[],
): FormMutationMeta {
  const pages = new Set<number>();
  for (const widget of changedWidgets) {
    if (widget.page) pages.add(widget.page.objectNumber);
  }
  return {
    affectedPages: [...pages].map((pageObjectNumber) => toPageRef(pageObjectNumber)),
    cacheDelta: null,
    changedFields,
    changedWidgets,
  };
}
