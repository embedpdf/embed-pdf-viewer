/**
 * The outline's commands, for the outline panel's buttons, its row menu and shortcuts. They act
 * on the selected items (`outline.getSelected()`); the panel selects a row before it opens the
 * row's menu. Changing the outline needs `doc.outline.modify` (`outline.canEdit()`) and the
 * `outline.editing` feature; expanding and collapsing changes only the view.
 */
import type { CommandDef } from '@embedpdf/react/commands';
import {
  OutlineToken,
  type OutlineCapability,
  type OutlineItem,
  type OutlineItemInput,
} from '@embedpdf/react/outline';
import { ShellToken } from '@embedpdf/react/shell';

type Ctx = Parameters<NonNullable<CommandDef['run']>>[0];

/** The outline panel's id in the layout. */
export const OUTLINE_PANEL = 'outline';
/**
 * A request to rename an item in its row: the selected one, once it isn't the item `after`
 * names (an add selects the item it makes). The panel takes the request and closes it.
 */
export const OUTLINE_RENAME = 'outline-rename';
/** The dialog that edits one item's title, look, target and open state (`props.item`). */
export const OUTLINE_PROPERTIES_DIALOG = 'outline-properties';
/** The menu of a row of the outline: the commands below, for that row. */
export const OUTLINE_ITEM_MENU = 'outline-item';

const outlineOf = (commandContext: Ctx): OutlineCapability | null =>
  commandContext.tryGet(OutlineToken);

/** The first selected item, as the outline holds it. */
const selectedOf = (commandContext: Ctx): OutlineItem | null => {
  const outline = outlineOf(commandContext);
  const [ref] = outline?.getSelected() ?? [];
  return ref ? (outline?.get(ref) ?? null) : null;
};

const hasSelection = (commandContext: Ctx): boolean => selectedOf(commandContext) !== null;

/** What a command that changes the outline needs: the right to, and the feature on. */
const EDITS = {
  categories: ['outline.editing'],
  allowed: (commandContext: Ctx) => outlineOf(commandContext)?.canEdit() ?? true,
  notAllowedKey: 'commands.notAllowed.doc-outline-modify',
} satisfies Partial<CommandDef>;

/**
 * Add an item and rename it in its row, as Acrobat's New Bookmark does: it goes to where the
 * view is, after the selected item, or at the end of the outline when none is selected.
 */
async function addItem(
  commandContext: Ctx,
  input: (selected: OutlineItem | null) => OutlineItemInput,
) {
  const outline = outlineOf(commandContext);
  if (!outline) return;
  const shell = commandContext.tryGet(ShellToken);
  const selected = selectedOf(commandContext);
  shell?.open(OUTLINE_PANEL);
  shell?.open(OUTLINE_RENAME, { props: { after: selected?.ref.objectNumber ?? null } });
  try {
    await outline.create(input(selected), { select: true });
  } catch (error) {
    shell?.close(OUTLINE_RENAME);
    throw error;
  }
}

export const outlineCommands: CommandDef[] = [
  {
    id: 'outline:add',
    labelKey: 'commands.outline.add',
    icon: 'plus',
    // Acrobat's New Bookmark.
    shortcut: 'Mod+B',
    ...EDITS,
    run: (commandContext) =>
      addItem(commandContext, (selected) =>
        selected ? { parent: selected.parent, position: { after: selected.ref } } : {},
      ),
  },
  {
    id: 'outline:add-child',
    labelKey: 'commands.outline.addChild',
    ...EDITS,
    enabled: hasSelection,
    run: (commandContext) =>
      addItem(commandContext, (selected) => (selected ? { parent: selected.ref } : {})),
  },
  {
    id: 'outline:rename',
    labelKey: 'commands.outline.rename',
    ...EDITS,
    enabled: hasSelection,
    run: (commandContext) => {
      const selected = selectedOf(commandContext);
      if (!selected) return;
      commandContext
        .tryGet(ShellToken)
        ?.open(OUTLINE_RENAME, { props: { item: selected.ref.objectNumber } });
    },
  },
  {
    id: 'outline:set-destination',
    labelKey: 'commands.outline.setDestination',
    ...EDITS,
    enabled: (commandContext) =>
      hasSelection(commandContext) && outlineOf(commandContext)?.getCurrentViewTarget() != null,
    run: async (commandContext) => {
      const outline = outlineOf(commandContext);
      const selected = selectedOf(commandContext);
      const target = outline?.getCurrentViewTarget() ?? null;
      if (outline && selected && target) await outline.update(selected.ref, { target });
    },
  },
  {
    id: 'outline:properties',
    labelKey: 'commands.outline.properties',
    ...EDITS,
    enabled: hasSelection,
    run: (commandContext) => {
      const selected = selectedOf(commandContext);
      if (!selected) return;
      commandContext.tryGet(ShellToken)?.open(OUTLINE_PROPERTIES_DIALOG, {
        exclusive: 'modal',
        props: { item: selected.ref.objectNumber },
      });
    },
  },
  {
    id: 'outline:delete',
    labelKey: 'commands.outline.delete',
    icon: 'trash',
    ...EDITS,
    enabled: hasSelection,
    run: async (commandContext) => {
      const outline = outlineOf(commandContext);
      const selected = outline?.getSelected() ?? [];
      if (outline && selected.length > 0) await outline.delete(selected);
    },
  },
  // A row's menu, opened from the row's own button or by a right-click on it.
  {
    id: 'menu:outline-item',
    labelKey: 'commands.outline.more',
    icon: 'dots',
    menu: OUTLINE_ITEM_MENU,
    ...EDITS,
  },
  {
    id: 'outline:expand-all',
    labelKey: 'commands.outline.expandAll',
    icon: 'chevronsDown',
    categories: ['outline'],
    run: (commandContext) => outlineOf(commandContext)?.expandAll(),
  },
  {
    id: 'outline:collapse-all',
    labelKey: 'commands.outline.collapseAll',
    icon: 'chevronsUp',
    categories: ['outline'],
    run: (commandContext) => outlineOf(commandContext)?.collapseAll(),
  },
];
