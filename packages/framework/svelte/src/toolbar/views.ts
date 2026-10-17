/**
 * The views `<Toolbar>`'s snippets receive and the parts it draws: core-ui's (`layoutToolbar`,
 * `groupMenuView`), over the commands plugin's resolved command.
 */
import type {
  CollapsedGroupView as CollapsedGroupViewOf,
  GroupDisclosureView as GroupDisclosureViewOf,
  OverflowMenuView as OverflowMenuViewOf,
  ToolbarPart as ToolbarPartOf,
} from '@embedpdf/core-ui';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';

/** What the `collapsed` snippet draws: a group folded into one control. */
export type CollapsedGroupView = CollapsedGroupViewOf<ResolvedCommand>;

/** What the `groupTrigger` snippet draws: the button inside a group that shed some of its items. */
export type GroupDisclosureView = GroupDisclosureViewOf<ResolvedCommand>;

/** What the `overflowMenu` snippet draws: the "More" menu. */
export type OverflowMenuView = OverflowMenuViewOf<ResolvedCommand>;

/** One thing in the toolbar, as `<Toolbar>` draws it. */
export type ToolbarPart = ToolbarPartOf<ResolvedCommand>;
