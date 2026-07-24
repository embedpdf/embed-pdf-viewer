/**
 * @embedpdf/viewer/core — the ENGINE-AGNOSTIC entry.
 *
 * Everything the main entry has — the element, `init()`, the customization
 * vocabulary, the DRIVE tokens — except a default engine: `config.engine` is
 * effectively required (an Engine, a factory thunk, or a registered provider
 * from a wrapping entry). This is what engine-injecting builds bundle (the
 * cloud snippet wires `cloudEngine`), so the local PDFium engine — wasm,
 * worker source, main-thread recipe — is structurally absent from their
 * module graph rather than stubbed out.
 *
 * App code should import `@embedpdf/viewer` (local engine included); this
 * entry exists for builds that always inject their own engine.
 */
import { EmbedPdfViewerElement } from './element';
import type { ViewerConfig } from './config';

export { EmbedPdfViewerElement } from './element';
export type { ViewerConfig } from './config';

// The engine seam's CONTRACT types, from the package that owns them — the
// transport-agnostic Engine v3 core that both the local and the cloud engine
// implement. The local recipe's vocabulary (LocalEngineConfig,
// LocalEngineRecipeOptions) ships with the MAIN entry, which is what actually
// bundles the local engine.
export type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';

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

// The DRIVE door: `el.viewer` speaks these tokens (the public capability
// lenses). This re-export list is the CDN's public-API act — see the chrome's
// index for the curation rule.
export {
  AnnotationToken,
  CommandsToken,
  DocumentsToken,
  FormToken,
  I18nToken,
  InteractionToken,
  MetadataToken,
  RedactionToken,
  SearchToken,
  SelectionToken,
  ShellToken,
  StageToken,
} from '@embedpdf/viewer-chrome';
export type {
  CapabilityToken,
  DocInfo,
  DocumentsCapability,
  ResolvedCommand,
  ScopedViewerHandle,
  Unsubscribe,
  ViewerHandle,
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
