import type {
  FormFieldFamily,
  FormFieldRef,
  FormMutationMeta,
  FormWidget,
} from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';

import type { WriteStamp } from '../../../document-session/DocumentSession';

/**
 * The meta of a form write: the fields and widgets it changed, the ones of
 * those it drew again (all of them unless `redrawnWidgets` says fewer), and
 * the pages those widgets sit on. Unplaced widgets name no page. Form writes
 * never change the page list, so there is no cache delta.
 */
export function formMutationMeta(
  stamp: WriteStamp,
  changedFields: FormFieldRef[],
  changedWidgets: FormWidget[],
  redrawnWidgets: FormWidget[] = changedWidgets,
): FormMutationMeta {
  const pages = new Set<number>();
  for (const widget of changedWidgets) {
    if (widget.page) pages.add(widget.page.objectNumber);
  }
  return {
    affectedPages: [...pages].map((pageObjectNumber) => toPageRef(pageObjectNumber)),
    cacheDelta: null,
    ...stamp,
    changedFields,
    changedWidgets,
    redrawnWidgets,
  };
}

/**
 * The widgets of a field a value write draws again: a checkbox's or radio
 * group's value only switches each widget's state between the pictures it
 * has.
 */
export function redrawnByValue(
  family: FormFieldFamily,
  widgets: readonly FormWidget[],
): FormWidget[] {
  return family === 'checkbox' || family === 'radio' ? [] : [...widgets];
}
