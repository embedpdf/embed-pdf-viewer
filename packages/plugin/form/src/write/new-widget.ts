/**
 * What a field's new widget needs that the caller didn't give: a radio
 * button's value, and whether adding it splits the field. `addWidget()` and
 * a duplicated radio button share them.
 */
import type { FormField } from '@embedpdf/engine-core/runtime';

/**
 * The value a radio group's new button gets: the next free `Choice<n>`,
 * counting on from its buttons (the radio tool names its first `Choice1`).
 */
export function nextChoiceOf(exportValues: readonly string[]): string {
  const taken = new Set(exportValues);
  let n = exportValues.length + 1;
  while (taken.has(`Choice${n}`)) n += 1;
  return `Choice${n}`;
}

/** Whether the field's dictionary is its only widget's too, which adding a widget splits. */
export const isMerged = (field: FormField): boolean =>
  field.ref.kind === 'objectNumber' &&
  field.widgets.some(
    (widget) => widget.objectNumber === (field.ref as { objectNumber: number }).objectNumber,
  );
