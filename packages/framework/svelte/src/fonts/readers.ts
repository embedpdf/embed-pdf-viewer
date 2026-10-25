/** The fonts' readers: the API, the state declared once in `fontsState`, and its events. */
import type { EventHook } from '@embedpdf/core';
import { FontsToken, fontsState } from '@embedpdf/plugin-fonts';
import type { FontsCapability } from '@embedpdf/plugin-fonts';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';

/**
 * The fonts API (the list, `resolve`, and the CSS a font is drawn with) of the nearest
 * `<DocumentScope>`'s document, else the active one. Outside a ready document, every method
 * throws `not-ready`.
 */
export function useFonts(): FontsCapability {
  return useCapability(FontsToken);
}

/**
 * The document's font list and its load state (the page's State table, declared once in
 * `fontsState`), as a reactive object: `state.fonts?.fonts`. Reading it loads the list. With a
 * selector, the value it picks as `{ current }`, which changes only when that value does.
 */
export const useFontsState = stateReader(fontsState);

/** Subscribe to one fonts event while the component lives: `useFontsEvent((fonts) => fonts.onFontListChanged, handler)`. */
export function useFontsEvent<T>(
  select: (fonts: FontsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(FontsToken, select, handler);
}
