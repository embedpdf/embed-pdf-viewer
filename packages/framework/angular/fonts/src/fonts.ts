/**
 * The fonts plugin's service and feature: a document's fonts, and the CSS and font programs a
 * browser draws text in them with. The plugin lists the fonts the first time something reads
 * them, and keeps the list live as writes add fonts and the engine's own fonts change:
 *
 *   protected readonly fonts = inject(EpdfFonts);
 *   names = computed(() => this.fonts.list()?.fonts.map((font) => font.name) ?? []);
 *   css = injectFontCss(() => 'helvetica'); // its programs mounted while the caller lives
 *
 * The plugin's State table reads a little differently here: the font list is `list()` (React's
 * `fonts`).
 */
import { inject, Injectable, type Signal } from '@angular/core';
import { injectFontMounts, pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import type { FontList, FontName, ResourceStatus } from '@embedpdf/angular/runtime';
import { fontsPlugin, fontsState, FontsToken, type FontCss } from '@embedpdf/plugin-fonts';

/**
 * The fonts of the document in scope (`[epdfDocumentScope]`), else the active one: the font list
 * as `list()`, its load state as `status()`, `ensureLoaded()` and `refresh()`, `resolve()`,
 * `getProgram()`, the CSS a font, a face or a resolved run is drawn with (`getFontCss()`,
 * `getFaceCss()`, `getRunCss()`), the fonts a box's text is painted in (`getPaintFonts()`), and
 * the stream `fontListChanged$`. With no document the signals read null and `'idle'`, and every
 * call refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfFonts extends pluginService({
  name: 'EpdfFonts',
  feature: 'withFonts()',
  token: FontsToken,
  // Reading the list loads it: nothing reads it as a document opens.
  ensure: fontsState.ensure,
  methods: [
    'ensureLoaded',
    'refresh',
    'resolve',
    'getProgram',
    'getFontList',
    'getStatus',
    'getFontCss',
    'getFaceCss',
    'getRunCss',
    'getPaintFonts',
    'getPaintFontsEpoch',
    'getFaceOfCssFamily',
  ],
  events: ['onFontListChanged'],
}) {
  /** Every font that can be named in the document, or null until the list has loaded. */
  readonly list: Signal<FontList | null> = this.binding.select(
    (fonts) => fonts.getFontList(),
    null,
    Object.is,
  );

  /** Whether the list is still loading, there, or not allowed. */
  readonly status: Signal<ResourceStatus> = this.binding.select(
    (fonts) => fonts.getStatus(),
    'idle',
    Object.is,
  );

  /**
   * The CSS `font()` is drawn with, again once its programs reach the browser; `null` for a `null`
   * font. Mount its programs where the text is drawn: {@link injectFontCss} does both.
   */
  fontCss(font: () => FontName | null): Signal<FontCss | null> {
    return this.binding.select(
      (fonts) => {
        const name = font();
        return name === null ? null : fonts.getFontCss(name);
      },
      null,
      Object.is,
    );
  }
}

/**
 * How to draw text in `font()` as the engine draws it: its CSS (`fontFamily`, `fontWeight`,
 * `fontStyle`; draw with `font-synthesis: none`), again once its programs reach the browser, with
 * the programs mounted while the caller lives. `null` for a `null` font. Call it in an injection
 * context.
 */
export function injectFontCss(font: () => FontName | null): Signal<FontCss | null> {
  const css = inject(EpdfFonts).fontCss(font);
  injectFontMounts(() => css()?.programs ?? []);
  return css;
}

/** Fonts, for `provideEmbedPdf()`. */
export function withFonts(): EmbedPdfFeature {
  return { plugins: [fontsPlugin()], services: [EpdfFonts] };
}
