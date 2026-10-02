/**
 * @embedpdf/vue/toolbar: `<Toolbar>`, which fits a bar of commands into the
 * width it has (labels become icons, groups fold, the rest goes into a "More"
 * menu) and lets you draw every part through its slots; `useStripView()` for a
 * strip that doesn't fit itself; and the schema a bar is written in.
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

export { default as Toolbar } from './toolbar/Toolbar.vue';
export { useStripView } from './toolbar/strip';
export type { StripView, StripViewGroup } from './toolbar/strip';
export type { CustomSlotCtx } from '@embedpdf/core-ui';
export type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './toolbar/views';
