/**
 * @embedpdf/viewer-chrome — the full viewer as a component, plus the
 * customization contract (README.md): additive registries in, an owned
 * layout in, pixels out.
 *
 * The defaults are exported AS values — that is the customization model. The
 * layout's edits are methods of the layout itself, so going from "pass
 * nothing" to "own the structure" needs no import at all.
 */
export { FullViewer, themeConfigOf, themeTokenProperty } from './viewer';
export type { FullViewerProps, ThemeConfig, ThemeTokens, ViewerCustomization } from './viewer';
export type {
  AnnotationFontSpec,
  AnnotationsCustomization,
  SignaturesCustomization,
  StampsCustomization,
} from './config-context';
// The prop types a delivery needs to speak FullViewer's contract.
export type { Engine, EngineFactory, Identity, InitialDocument } from '@embedpdf/react/runtime';

// ── the viewer in code + the public capability tokens ────────────────────────
// `get(name)` and `get(Token)` return each plugin's public lens verbatim —
// capability types arrive through the token generics, so the plugin names and
// this list of tokens are the public-API act. Host lenses (`/contract/host`
// entries, host tokens) are deliberately absent and unreachable from a
// delivery bundle. Additions are features; removals are breaking — grow this
// list by demand, never speculatively.
export { VIEWER_PLUGINS, createViewer } from './handle';
export type { PluginName, PluginTokens, ScopedViewer, Viewer, ViewerPlugins } from './handle';
export type { Feature, ReadOnlyExceptions } from './features';
export type {
  CapabilityToken,
  DocumentInfo,
  DocumentsCapability,
  Unsubscribe,
} from '@embedpdf/react/runtime';
export type { CommandsCapability, NotAllowedMode, ResolvedCommand } from '@embedpdf/react/commands';
export { DocumentsToken } from '@embedpdf/react/runtime';
export { CommandsToken } from '@embedpdf/react/commands';
export { AnnotationToken } from '@embedpdf/react/annotation';
export { StageToken } from '@embedpdf/react/stage';
export { SearchToken } from '@embedpdf/react/search';
export { SelectionToken } from '@embedpdf/react/selection';
export { FormToken } from '@embedpdf/react/form';
export { MeasurementToken } from '@embedpdf/react/measurement';
export type {
  MeasurementCapability,
  MeasurementConfig,
  ScaleChangeReport,
} from '@embedpdf/react/measurement';
export { RedactionToken } from '@embedpdf/react/redaction';
// Stamp libraries are workspace state an embedder seeds: `viewer.get(StampToken)
// .importLibrary(companyStamps)` puts their own stamps in the stamps sidebar.
export { StampToken } from '@embedpdf/react/stamp';
// Signatures: the act (`viewer.get(SignatureToken).sign(…)`) and the
// signer ports a config names — one import for the whole feature.
export { SignatureToken } from '@embedpdf/react/signature';
export {
  createTestSigner,
  indexedDbKeyStore,
  memoryKeyStore,
  personalSigner,
  remoteSigner,
  webCryptoSigner,
} from '@embedpdf/react/signature';
export type {
  Mark,
  SignatureMode,
  SignerPort,
  SignFieldInput,
  TrustPort,
} from '@embedpdf/react/signature';
export { InteractionToken } from '@embedpdf/react/interaction';
export { I18nToken } from '@embedpdf/react/i18n';
export { ShellToken } from '@embedpdf/react/shell';
export { MetadataToken } from '@embedpdf/react/metadata';

export { defaultLayout } from './config/chrome';
export { defaultCommands } from './config/commands';
export { ICON_PATHS as defaultIcons } from './ui/icons';
export type { IconDef, PathSpec } from './ui/icons';
export type { ThemeMode, ThemePreference } from './ui/theme';

// ── the layout (core-ui): its data, the layout and its edits, the env ────────
export { createLayout } from '@embedpdf/core-ui';
export type {
  AddItemOptions,
  BarEdge,
  BarPlace,
  FloatPosition,
  Importance,
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
  RemoveItemOptions,
  SectionName,
  SelectionTarget,
  TabsVisibility,
  Variant,
  ViewerSize,
} from '@embedpdf/core-ui';
export type { CommandDef } from '@embedpdf/react/commands';
