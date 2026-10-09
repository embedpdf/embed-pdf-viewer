/**
 * @embedpdf/svelte/toolbar — a toolbar that fits the width it has.
 *
 * `<Toolbar>` fits a bar of commands into its width (labels become icons, groups fold, the rest
 * goes into a "More" menu) and lets you draw every part with snippets; `useStripView()` is a
 * strip that doesn't fit itself; and the schema a bar is written in comes from here too.
 */

// The toolbar's vocabulary: the schema a bar is written in, and the helpers that change one.
export {
  DEFAULT_IMPORTANCE,
  PINNED,
  addItem,
  chromeHelpers,
  custom,
  defineChrome,
  group,
  item,
  removeItems,
  replaceItem,
  validateChrome,
} from '@embedpdf/core-ui';
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
  FrameSchema,
  Importance,
  MenuSchema,
  MenuSection,
  OverflowRow,
  OverflowSection,
  Variant,
} from '@embedpdf/core-ui';

export { default as Toolbar } from './toolbar/Toolbar.svelte';
export type { ToolbarProps } from './toolbar/props';
export type { CustomSlotCtx } from '@embedpdf/core-ui';
export type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './toolbar/views';
export { useStripView } from './toolbar/strip.svelte';
export type { StripView, StripViewGroup } from './toolbar/strip.svelte';
