/**
 * What every control of `<FormLayer>` shares besides its box (`WidgetBox.svelte`): running the
 * widget's action on a click, the style of a control that fills the box, as CSS text, and
 * whether it is drawn inside a control of the app's own. A Svelte `style` attribute is a string,
 * while `@embedpdf/web` hands styles out as records (`cssText` writes one as text).
 */
import { hasContext, setContext } from 'svelte';
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

const EMBEDDED = Symbol('embedpdf.form-embedded-control');

/**
 * For the layer's own drawing of a box inside a control of the app's own (`native`): the
 * controls below it are embedded. The app's box around them is then the widget's event surface
 * and the cursor's way in, and each control only fills the place it is given.
 */
export function setEmbedded(): void {
  setContext(EMBEDDED, true);
}

/** Whether this control is drawn inside a control of the app's own ({@link setEmbedded}). */
export function isEmbedded(): boolean {
  return hasContext(EMBEDDED);
}
