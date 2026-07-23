/**
 * @embedpdf/viewer-chrome — the full viewer as a component, plus the
 * customization contract (README.md): additive registries in, an owned
 * chrome value in, pixels out.
 *
 * The defaults are exported AS VALUES — that is the customization model.
 * Schema sugar and transforms are re-exported so a consumer needs exactly
 * one import line to go from "pass nothing" to "own the structure".
 */
export { FullViewer } from './viewer';
export type { FullViewerProps, ViewerCustomization } from './viewer';
// The prop types a delivery needs to speak FullViewer's contract.
export type { Engine, EngineFactory, InitialDocument } from '@embedpdf/react/runtime';

// ── the DRIVE door: the viewer handle + the public capability tokens ─────────
// `get(Token)` returns each plugin's PUBLIC lens verbatim — capability types
// arrive through the token generics, so this list of tokens IS the public-API
// act. Internal lenses (`/internal` entries, host tokens) are deliberately
// absent and unreachable from a delivery bundle. Additions are features;
// removals are breaking — grow this list by demand, never speculatively.
export { createViewerHandle } from './handle';
export type { ScopedViewerHandle, ViewerHandle } from './handle';
export type { CapabilityToken, DocumentsCapability, Unsubscribe } from '@embedpdf/react/runtime';
export type { ResolvedCommand } from '@embedpdf/react/commands';
export { DocumentsToken } from '@embedpdf/react/runtime';
export { CommandsToken } from '@embedpdf/react/commands';
export { AnnotationToken } from '@embedpdf/react/annotation';
export { StageToken } from '@embedpdf/react/stage';
export { SearchToken } from '@embedpdf/react/search';
export { SelectionToken } from '@embedpdf/react/selection';
export { FormToken } from '@embedpdf/react/form';
export { RedactionToken } from '@embedpdf/react/redaction';
export { InteractionToken } from '@embedpdf/react/interaction';
export { I18nToken } from '@embedpdf/react/i18n';
export { ShellToken } from '@embedpdf/react/shell';
export { MetadataToken } from '@embedpdf/react/metadata';

export { defaultChrome } from './config/chrome';
export { defaultCommands } from './config/commands';
export { ICON_PATHS as defaultIcons } from './ui/icons';
export type { IconDef, PathSpec } from './ui/icons';
export type { ThemeMode, ThemePreference } from './ui/theme';

// ── the schema vocabulary + transforms (ui-core, via the React adapter) ──────
export {
  addItem,
  chromeHelpers,
  custom,
  defineChrome,
  group,
  item,
  removeItems,
  replaceItem,
  validateChrome,
} from '@embedpdf/react/toolbar';
export type {
  AddItemSpec,
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  ChromeHelpers,
  ChromeSchema,
  CustomItem,
  Importance,
  MenuSchema,
  MenuSection,
  Variant,
} from '@embedpdf/react/toolbar';
export type { CommandDef } from '@embedpdf/react/commands';
