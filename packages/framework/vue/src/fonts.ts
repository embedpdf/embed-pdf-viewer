/**
 * @embedpdf/vue/fonts: the Vue view of `@embedpdf/plugin-fonts`. The plugin
 * lists the document's fonts the first time something reads them, and keeps
 * the list live as writes add fonts and the engine's own fonts change.
 *
 *   const fonts = useFonts();
 *   const { fonts: list, status } = useFontsState();
 *   const css = fonts.getFontCss('helvetica'); // mount css.programs where you draw it
 *   useFontMounts(() => css.programs);
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-fonts';
import { FontsToken, fontsState } from '@embedpdf/plugin-fonts';
import type { FontsCapability } from '@embedpdf/plugin-fonts';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { stateComposable } from './state';

export { useFontMounts } from './runtime/font-mounts';

/**
 * The fonts API (the list, `resolve`, and the CSS a font is drawn with) of
 * the nearest `<DocumentScope>`'s document, else the active one. The object
 * never changes; outside a document every method throws `not-ready`.
 */
export function useFonts(): FontsCapability {
  return useCapability(FontsToken);
}

/**
 * The fonts' state as refs: the document's font list and its load state (the
 * page's State table, declared once in `fontsState`). Reading it loads the
 * list. With a selector, one ref for the value it picks, which updates only
 * when that value changes.
 */
export const useFontsState = stateComposable(fontsState);

/** Subscribe to one fonts event while the component lives: `useFontsEvent((fonts) => fonts.onFontListChanged, handler)`. */
export function useFontsEvent<Event>(
  select: (fonts: FontsCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(FontsToken, select, handler);
}
