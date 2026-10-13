/**
 * @embedpdf/viewer-chrome — the full viewer as a component, plus the
 * customization contract (README.md): additive registries in, an owned
 * layout in, pixels out.
 *
 * The defaults are exported AS values — that is the customization model. The
 * layout's edits are methods of the layout itself, so going from "pass
 * nothing" to "own the structure" needs no import at all.
 */
export { FullViewer } from './viewer';
export type { FullViewerProps, ViewerCustomization } from './viewer';
// Your own components: where a toolbar item sits, and the viewer's own components a delivery
// places in the page for the viewer to draw.
export { TOOLBAR_ITEM_CONTEXT_ATTRIBUTES } from './ui/item-context';
export type { ToolbarItemContext, ToolbarItemEdge } from './ui/item-context';
export { createPlacedComponents } from './ui/placed-components';
export type {
  PlacedButton,
  PlacedComponent,
  PlacedComponents,
  PlacedMenu,
  PlacedMenuItem,
} from './ui/placed-components';
export type { PanelResizeEvent, ViewerFont } from './config-context';
export type {
  PluginSettings,
  SignatureFont,
  ViewerPluginsConfig,
  ViewerSignatureSettings,
  ViewerStampSettings,
} from './plugin-settings';
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
export type {
  PluginName,
  PluginTokens,
  ScopedViewer,
  Viewer,
  ViewerLifetime,
  ViewerPlugins,
} from './handle';
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
export { RenderToken } from '@embedpdf/react/render';
export { LinkToken } from '@embedpdf/react/link';
export { PageEditToken } from '@embedpdf/react/page-edit';
export { ActionsToken } from '@embedpdf/react/actions';

export { defaultLayout } from './config/chrome';
export { defaultCommands } from './config/commands';
export { ICON_PATHS as defaultIcons } from './ui/icons';
export type { IconDef, IconName, IconPaths, PathSpec } from './ui/icons';
export { THEME_TOKENS, themeConfigOf, themeTokenCss } from './ui/theme';
export type { ThemeConfig, ThemeMode, ThemePreference, ThemeToken, ThemeTokens } from './ui/theme';

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
  PanelPresentationBySize,
  PanelWidth,
  RemoveItemOptions,
  SectionName,
  SelectionTarget,
  TabsVisibility,
  Variant,
  ViewerSize,
} from '@embedpdf/core-ui';
// A command as the `commands` config takes it: the headless one, with the viewer's words.
export type { CommandContext, CommandDef } from './config/viewer-commands';
