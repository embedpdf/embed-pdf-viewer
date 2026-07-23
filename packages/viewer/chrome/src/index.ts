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

export { defaultChrome } from './config/chrome';
export { defaultCommands } from './config/commands';
export type { IconDef, PathSpec } from './ui/icons';

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
