/**
 * The stylesheets the viewer's shadow roots adopt. Constructed, never a
 * `<style>` element, so a strict `style-src` needs no exception. The chrome's
 * sheet is made once per page and shared: by every viewer, and by the
 * viewer's own components in the page (`<epdf-button>`, `<epdf-menu>`), so
 * they're drawn with the same pixels.
 */
import chromeCss from '@embedpdf/viewer-chrome/styles.css?inline';

/** A constructed stylesheet holding `css`. */
export function sheetOf(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}

let chrome: CSSStyleSheet | null = null;

/** The chrome's sheet: its tokens, and the utilities its components are drawn with. */
export function chromeSheet(): CSSStyleSheet {
  chrome ??= sheetOf(chromeCss);
  return chrome;
}
