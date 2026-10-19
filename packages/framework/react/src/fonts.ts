/**
 * The React surface for @embedpdf/plugin-fonts: the capability, the state
 * declared once in `fontsState`, and its events. The plugin lists the
 * document's fonts the first time something reads them, and keeps the list
 * live as writes add fonts and the engine's own fonts change.
 *
 *   const fonts = useFonts();
 *   const { fonts: list, status } = useFontsState();
 *   const css = fonts.getFontCss('helvetica'); // mount css.programs where you draw it
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-fonts';
import type { EventHook } from '@embedpdf/core';
import { FontsToken, fontsState, type FontsCapability } from '@embedpdf/plugin-fonts';

import { useCapability, useCapabilityEvent } from './runtime';
import { stateHook } from './state';

export { useFontMounts } from './font-mounts';

/**
 * The fonts capability (the list, `resolve`, and the CSS a font is drawn
 * with) of the surrounding `<DocumentScope>`'s document, else the active one.
 * Outside a document, every method throws `not-ready`.
 */
export function useFonts(): FontsCapability {
  return useCapability(FontsToken);
}

/**
 * The fonts' state: the document's font list and its load state (the page's
 * State table, declared once in `fontsState`). Reading it loads the list.
 * Takes a selector, and re-renders only when what it returns changes.
 */
export const useFontsState = stateHook(fontsState);

/** Subscribe to one fonts event for the mounted lifetime: `useFontsEvent((fonts) => fonts.onFontListChanged, handler)`. */
export function useFontsEvent<T>(
  select: (fonts: FontsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(FontsToken, select, handler);
}
