/**
 * @embedpdf/vue/fonts: the Vue view of `@embedpdf/plugin-fonts`. The plugin
 * lists the document's fonts the first time something reads them, and keeps
 * the list live as writes add fonts and the engine's own fonts change.
 *
 *   const fonts = useFonts();
 *   const { fonts: list, status } = useFontsState();
 *   const css = useFontCss('helvetica'); // its programs mounted while the component lives
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-fonts';
import { toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { FontsToken, fontsState } from '@embedpdf/plugin-fonts';
import type { FontCss, FontsCapability } from '@embedpdf/plugin-fonts';
import type { EventHook, FontName } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useOptionalSelector } from './runtime/capabilities';
import { useFontMounts } from './runtime/font-mounts';
import { stateComposable } from './state';

export { useFontMounts };

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

/**
 * How to draw text in `font` as the engine draws it, as a ref: its CSS (`fontFamily`,
 * `fontWeight`, `fontStyle`; draw with `font-synthesis: none`), again once its programs reach the
 * browser, with the programs mounted while the component lives. `null` for a `null` font, and
 * outside a document with the fonts plugin.
 */
export function useFontCss(font: MaybeRefOrGetter<FontName | null>): Readonly<Ref<FontCss | null>> {
  const css = useOptionalSelector(
    FontsToken,
    (fonts) => {
      const name = toValue(font);
      return name === null ? null : fonts.getFontCss(name);
    },
    null,
  );
  useFontMounts(() => css.value?.programs ?? []);
  return css;
}
