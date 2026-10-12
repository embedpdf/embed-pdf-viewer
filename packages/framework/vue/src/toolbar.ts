/**
 * @embedpdf/vue/toolbar: `<Toolbar>`, which fits a bar of commands into the
 * width it has (labels become icons, groups fold, the rest goes into a "More"
 * menu) and lets you draw every part through its slots; `useStripView()` for a
 * strip that doesn't fit itself; and the schema a bar is written in.
 */

// The toolbar's vocabulary: the schema a bar is written in.
export { DEFAULT_IMPORTANCE, PINNED, custom, group, item } from '@embedpdf/core-ui';
export type {
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  CustomItem,
  Importance,
  OverflowRow,
  OverflowSection,
  Variant,
} from '@embedpdf/core-ui';

export { default as Toolbar } from './toolbar/Toolbar.vue';
export { useStripView } from './toolbar/strip';
export type { StripView, StripViewGroup } from './toolbar/strip';
export type { CustomSlotCtx } from '@embedpdf/core-ui';
export type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './toolbar/views';
