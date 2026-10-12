/**
 * The kernel's public surface — everything every door exports, which is
 * everything that is not the engine seam. Each door star-exports this file and
 * then adds its own seam contract (`ViewerConfig` + `InitOptions` + `init`),
 * the only thing doors disagree about.
 *
 * See docs/conventions/viewer-doors.md for the laws. The one that matters
 * here: nothing under `kernel/` may import from `doors/` or `local/`. Read
 * that as "the word 'local' cannot appear in this directory" and the rest
 * follows.
 */
export { EmbedPdfViewerElement, type DefaultEngineProvider } from './element';
export { initViewer } from './init';
export type { DocumentSrc, ElementConfig, LiveConfigKey, ViewerConfigBase } from './config';
export type { MountTarget } from './init';

// The engine seam's contract types, from the package that owns them — the
// transport-agnostic engine core that both the local and the cloud engine
// implement. Each engine's options type ships with that engine's own door
// (LocalEngineConfig with the local door here; CloudEngineOptions with
// @cloudpdf/viewer), next to the code that can interpret it.
export type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';

// The customization vocabulary, verbatim from the chrome (see its README).
export {
  createLayout,
  defaultCommands,
  defaultIcons,
  defaultLayout,
} from '@embedpdf/viewer-chrome';

// The drive door: `el.viewer` speaks these tokens (the public capability
// lenses). This re-export list is the CDN's public-API act — see the chrome's
// index for the curation rule.
export {
  AnnotationToken,
  CommandsToken,
  DocumentsToken,
  FormToken,
  I18nToken,
  InteractionToken,
  MeasurementToken,
  MetadataToken,
  RedactionToken,
  SearchToken,
  SelectionToken,
  ShellToken,
  SignatureToken,
  StageToken,
  StampToken,
} from '@embedpdf/viewer-chrome';
// Signatures: the signer ports a `signatures` config names — the same one
// import as the chrome (`personalSigner` keeps a self-signed identity in the
// browser; `webCryptoSigner` / `remoteSigner` bring the embedder's key).
export {
  createTestSigner,
  indexedDbKeyStore,
  memoryKeyStore,
  personalSigner,
  remoteSigner,
  webCryptoSigner,
} from '@embedpdf/viewer-chrome';
export type {
  AnnotationFontSpec,
  AnnotationsCustomization,
  Mark,
  SignatureMode,
  SignaturesCustomization,
  SignerPort,
  SignFieldInput,
  StampsCustomization,
  TrustPort,
} from '@embedpdf/viewer-chrome';
export type {
  CapabilityToken,
  CommandsCapability,
  DocumentInfo,
  DocumentsCapability,
  NotAllowedMode,
  PluginName,
  ResolvedCommand,
  ScopedViewer,
  Unsubscribe,
  Viewer,
  ViewerPlugins,
} from '@embedpdf/viewer-chrome';
export type {
  AddItemOptions,
  BarEdge,
  BarPlace,
  CommandDef,
  Feature,
  FloatPosition,
  IconDef,
  Identity,
  Importance,
  InitialDocument,
  Layout,
  LayoutBar,
  LayoutCommandItem,
  LayoutCustomItem,
  LayoutData,
  LayoutEnv,
  LayoutFunction,
  LayoutGroup,
  LayoutGroupObject,
  LayoutItem,
  LayoutMenu,
  LayoutMenuSection,
  LayoutOption,
  LayoutPanel,
  LayoutPanelPatch,
  LayoutSection,
  PanelPresentation,
  PathSpec,
  ReadOnlyExceptions,
  RemoveItemOptions,
  SectionName,
  SelectionTarget,
  TabsVisibility,
  ThemeMode,
  ThemePreference,
  Variant,
  ViewerCustomization,
  ViewerSize,
} from '@embedpdf/viewer-chrome';
