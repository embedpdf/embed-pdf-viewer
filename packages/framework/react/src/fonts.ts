/**
 * The React surface for @embedpdf/plugin-fonts: the capability, the state
 * declared once in `fontsState`, and its events. The plugin lists the
 * document's fonts the first time something reads them, and keeps the list
 * live as writes add fonts and the engine's own fonts change.
 *
 *   const fonts = useFonts();
 *   const { fonts: list, status } = useFontsState();
 *   const css = useFontCss('helvetica'); // its programs mounted while the component lives
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-fonts';
import type { EventHook, FontName } from '@embedpdf/core';
import {
  FontsToken,
  fontsState,
  type FontCss,
  type FontsCapability,
  type MountableFontProgram,
} from '@embedpdf/plugin-fonts';

import { useFontMounts } from './font-mounts';
import { useCapability, useCapabilityEvent, useOptionalSelector } from './runtime';
import { stateHook } from './state';

export { useFontMounts };

const NO_PROGRAMS: readonly MountableFontProgram[] = [];

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

/**
 * How to draw text in `font` as the engine draws it: its CSS (`fontFamily`, `fontWeight`,
 * `fontStyle`; draw with `fontSynthesis: 'none'`), again once its programs reach the browser, with
 * the programs mounted while the component lives. `null` for a `null` font, and outside a document
 * with the fonts plugin.
 */
export function useFontCss(font: FontName | null): FontCss | null {
  const css = useOptionalSelector(
    FontsToken,
    (fonts) => (font === null ? null : fonts.getFontCss(font)),
    null,
  );
  useFontMounts(css?.programs ?? NO_PROGRAMS);
  return css;
}
