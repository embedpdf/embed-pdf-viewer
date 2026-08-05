/**
 * The KERNEL's public surface — everything every door exports, which is
 * everything that is not the engine seam. Each door star-exports this file and
 * then adds its own seam contract (`ViewerConfig` + `InitOptions` + `init`),
 * the only thing doors disagree about.
 *
 * See ../../DOORS.md for the laws. The one that matters here: nothing under
 * `kernel/` may import from `doors/` or `local/`. Read that as "the word
 * 'local' cannot appear in this directory" and the rest follows.
 */
export { EmbedPdfViewerElement, type DefaultEngineProvider } from './element';
export { initViewer } from './init';
export type { ElementConfig, ViewerConfigBase } from './config';
export type { MountTarget } from './init';

// The engine seam's CONTRACT types, from the package that owns them — the
// transport-agnostic Engine v3 core that both the local and the cloud engine
// implement. Each engine's OPTIONS type ships with that engine's own door
// (LocalEngineConfig with the local door here; CloudEngineOptions with
// @cloudpdf/viewer), next to the code that can interpret it.
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
