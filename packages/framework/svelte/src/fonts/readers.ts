/** The fonts' readers: the API, the state declared once in `fontsState`, and its events. */
import type { EventHook, FontName } from '@embedpdf/core';
import { FontsToken, fontsState } from '@embedpdf/plugin-fonts';
import type { FontCss, FontsCapability } from '@embedpdf/plugin-fonts';
import { useFontMounts } from '../runtime/font-mounts.svelte';
import { useCapability, useCapabilityEvent, useOptionalSelector } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';
import { valueOf, type CurrentValue, type MaybeGetter } from '../runtime/values.svelte';

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

/**
 * How to draw text in `font` as the engine draws it, as `{ current }`: its CSS (`fontFamily`,
 * `fontWeight`, `fontStyle`; draw with `font-synthesis: none`), again once its programs reach the
 * browser, with the programs mounted while the component lives. `null` for a `null` font, and
 * outside a document with the fonts plugin. Call it while a component is created.
 */
export function useFontCss(font: MaybeGetter<FontName | null>): CurrentValue<FontCss | null> {
  const css = useOptionalSelector(
    FontsToken,
    (fonts) => {
      const name = valueOf(font);
      return name === null ? null : fonts.getFontCss(name);
    },
    null,
  );
  useFontMounts(() => css.current?.programs ?? []);
  return css;
}
