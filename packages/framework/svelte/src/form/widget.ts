/**
 * What every control of `<FormLayer>` shares besides its box (`WidgetBox.svelte`): running the
 * widget's action on a click, and the style of a control that fills the box, as CSS text. A
 * Svelte `style` attribute is a string, while `@embedpdf/web` hands styles out as records
 * (`cssText` writes one as text).
 */
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// The layer's lens on the plugin: the same capability, typed wider for the framework layers.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { cssText, FORM_CONTROL_FILL } from '@embedpdf/web';
import { useCapability } from '../runtime/readers.svelte';

/**
 * A click on a widget runs its `/A` action. ISO 32000 puts the activate action on the widget,
 * whatever its field, and many forms ship "buttons" as read-only text fields with an `/A` that
 * Acrobat runs; a widget without one is inert. The widget's address is read at the click: the
 * engine gives a widget it has just placed its address later.
 */
export function useWidgetActivation(
  annotationRef: () => FormWidgetItem['annotationRef'],
): () => void {
  const form = useCapability(FormHostToken);
  return () => {
    const target = annotationRef();
    if (target) void form.activateWidget(target);
  };
}

/** Fills the box it sits in, as CSS text. */
export const FILL = cssText(FORM_CONTROL_FILL);
