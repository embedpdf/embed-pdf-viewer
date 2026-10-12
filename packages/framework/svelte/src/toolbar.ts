/**
 * @embedpdf/svelte/toolbar — a toolbar that fits the width it has.
 *
 * `<Toolbar>` fits a bar of commands into its width (labels become icons, groups fold, the rest
 * goes into a "More" menu) and lets you draw every part with snippets; `useStripView()` is a
 * strip that doesn't fit itself; and the schema a bar is written in comes from here too.
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

export { default as Toolbar } from './toolbar/Toolbar.svelte';
export type { ToolbarProps } from './toolbar/props';
export type { CustomSlotCtx } from '@embedpdf/core-ui';
export type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './toolbar/views';
export { useStripView } from './toolbar/strip.svelte';
export type { StripView, StripViewGroup } from './toolbar/strip.svelte';
