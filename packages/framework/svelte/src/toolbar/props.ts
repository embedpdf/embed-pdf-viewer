/** The props of `<Toolbar>`: the bar and how it runs, and a snippet for every part you draw. */
import type { Snippet } from 'svelte';
import type { BarSchema, CustomSlotCtx } from '@embedpdf/core-ui';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './views';

export interface ToolbarProps {
  /** What goes in the toolbar: its sections, groups and items. */
  bar: BarSchema;
  /**
   * Which way the toolbar runs. A vertical toolbar fits the height it's given, so give it one; it
   * stacks its sections top, middle and bottom, and draws every command at `'icon'`, with the
   * label for a tooltip. Default `'horizontal'`.
   */
  orientation?: 'horizontal' | 'vertical';
  /** Px between adjacent items (the CSS flex gap; the fit budgets the same number). Default 8. */
  gap?: number;
  /**
   * The thickness of the separator your `separator` snippet draws: its width across a horizontal
   * toolbar, its height in a vertical one. Default 1.
   */
  separatorWidth?: number;
  /** The toolbar's name for screen readers, for a page with more than one toolbar. */
  'aria-label'?: string;
  class?: string;
  style?: string;
  /** A command's button at a variant. Default: a plain `<button>` with the command's label. */
  command?: Snippet<[command: ResolvedCommand, variant: string, run: () => void]>;
  /**
   * Your own items, by `name` (from `custom(name, command)`): it draws every custom item in the
   * bar. Without it, each item is a native `<slot name>` element with its command's button
   * inside, for a custom element's children to fill. The first element of an item that takes
   * focus is the item's stop in the toolbar's arrow-key order.
   */
  custom?: Snippet<[name: string, variant: string, ctx: CustomSlotCtx]>;
  /** A folded group: its button and its menu. Default: a `<select>` for `'select'`, a menu button for `'menu'`. */
  collapsed?: Snippet<[view: CollapsedGroupView]>;
  /** The button of a group that shed items, and its menu. Default: a chevron opening a menu. */
  groupTrigger?: Snippet<[view: GroupDisclosureView]>;
  /** The line between groups. Default: a 1px line across the toolbar. */
  separator?: Snippet;
  /** The "More" button. Default: a plain ⋯ button. */
  overflowTrigger?: Snippet<[isOpen: boolean, toggle: () => void]>;
  /** The "More" menu, with its sections, rows and the call that runs each one. Default: a minimal popover. */
  overflowMenu?: Snippet<[view: OverflowMenuView]>;
}
