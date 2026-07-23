/**
 * @embedpdf/viewer — the vanilla entry.
 *
 * ```html
 * <div id="viewer" style="height:100vh"></div>
 * <script type="module">
 *   import EmbedPDF from 'https://cdn.embedpdf.com/v3/embedpdf.js';
 *   EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
 * </script>
 * ```
 *
 * Everything the customization ladder needs — the defaults as values, the
 * schema sugar, the transforms — re-exports from here, so one import line
 * serves "pass nothing" through "own the structure".
 */
import { EmbedPdfViewerElement } from './element';
import type { ViewerConfig } from './config';

export { EmbedPdfViewerElement } from './element';
export type { ViewerConfig } from './config';

// The customization vocabulary, verbatim from the chrome (see its README).
export {
  addItem,
  chromeHelpers,
  custom,
  defaultChrome,
  defaultCommands,
  defaultIcons,
  defineChrome,
  group,
  item,
  removeItems,
  replaceItem,
  validateChrome,
} from '@embedpdf/viewer-chrome';
export type {
  AddItemSpec,
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  ChromeHelpers,
  ChromeSchema,
  CommandDef,
  CustomItem,
  IconDef,
  Importance,
  InitialDocument,
  MenuSchema,
  MenuSection,
  PathSpec,
  ThemeMode,
  ThemePreference,
  Variant,
  ViewerCustomization,
} from '@embedpdf/viewer-chrome';

export interface InitOptions extends ViewerConfig {
  /** Where the viewer mounts: an element or a selector. */
  target: HTMLElement | string;
}

/** Create an <embedpdf-viewer>, configure it, append it to `target`. */
function init(options: InitOptions): EmbedPdfViewerElement {
  const { target, ...config } = options;
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new Error(`[embedpdf] init: target not found: ${String(target)}`);
  const element = document.createElement('embedpdf-viewer') as EmbedPdfViewerElement;
  element.config = config;
  host.appendChild(element);
  return element;
}

const EmbedPDF = { init };
export default EmbedPDF;
