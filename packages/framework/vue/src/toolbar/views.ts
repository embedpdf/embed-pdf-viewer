/**
 * The views `<Toolbar>`'s slots receive and the parts it draws: core-ui's
 * (`layoutToolbar`, `groupMenuView`), over the commands plugin's resolved
 * command.
 */
import type {
  CollapsedGroupView as CollapsedGroupViewOf,
  GroupDisclosureView as GroupDisclosureViewOf,
  OverflowMenuView as OverflowMenuViewOf,
  ToolbarPart as ToolbarPartOf,
} from '@embedpdf/core-ui';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';

/** What the `#collapsed` slot draws: a group folded into one control. */
export type CollapsedGroupView = CollapsedGroupViewOf<ResolvedCommand>;

/** What the `#group-trigger` slot draws: the button inside a group that shed some of its items. */
export type GroupDisclosureView = GroupDisclosureViewOf<ResolvedCommand>;

/** What the `#overflow-menu` slot draws: the "More" menu. */
export type OverflowMenuView = OverflowMenuViewOf<ResolvedCommand>;

/** One thing in the toolbar, as `<ToolbarPart>` draws it. */
export type ToolbarPart = ToolbarPartOf<ResolvedCommand>;
