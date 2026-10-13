/**
 * The keyboard shortcuts sheet, which `?` opens (`help:shortcuts`): every command with a
 * shortcut, in groups, in the viewer's language, with its keys as this platform shows them. A
 * command that's turned off or not allowed is left out, since its keys do nothing here; so is
 * one that isn't there now, except a command on what's selected, which shows whether or not
 * anything is.
 */
import { formatShortcut } from '@embedpdf/core-ui';
import { useCommands, type CommandsCapability } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { useDocumentId, useKernelValue } from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { isMacPlatform } from '@embedpdf/web';
import { useId } from 'react';

import { SHORTCUTS_DIALOG } from '../config/commands';
import { Dialog } from './dialog';
import { Icon } from './icons';

/** One row: a command's label and its keys. */
export interface ShortcutRow {
  readonly commandId: string;
  readonly label: string;
  readonly shortcuts: readonly string[];
}

/** A group of rows under its title's translation key. */
export interface ShortcutGroup {
  readonly titleKey: string;
  readonly rows: readonly ShortcutRow[];
}

/** The groups, in order, by the area a command's id starts with (`zoom` for `zoom:in`). */
const GROUPS: readonly { readonly titleKey: string; readonly areas: readonly string[] }[] = [
  { titleKey: 'shortcuts.document', areas: ['document'] },
  {
    titleKey: 'shortcuts.viewing',
    areas: ['page', 'zoom', 'view', 'panel', 'menu', 'mode', 'help'],
  },
  {
    titleKey: 'shortcuts.editing',
    areas: ['history', 'tool', 'selection', 'annotation', 'redaction', 'measurement'],
  },
];
/** Every other command, yours among them. */
const OTHER_GROUP = 'shortcuts.other';

/** The areas whose commands act on what's selected: there whether or not anything is now. */
const ON_A_SELECTION = new Set(['selection', 'annotation']);

const areaOf = (commandId: string): string => commandId.split(':')[0] ?? commandId;

/** The sheet's groups for a document: the ones with a row, in order. */
export function shortcutGroupsOf(
  commands: Pick<CommandsCapability, 'listShortcuts' | 'getRefusal' | 'resolveCommand'>,
  documentId: string | undefined,
): ShortcutGroup[] {
  const ids = [...new Set(commands.listShortcuts().map((entry) => entry.commandId))];
  const rows = ids.flatMap((commandId): ShortcutRow[] => {
    if (commands.getRefusal(commandId, documentId)) return [];
    const command = commands.resolveCommand(commandId, documentId);
    if (!command || command.shortcuts.length === 0) return [];
    if (!command.visible && !ON_A_SELECTION.has(areaOf(commandId))) return [];
    return [{ commandId, label: command.label, shortcuts: command.shortcuts }];
  });
  const groupOf = (row: ShortcutRow): string =>
    GROUPS.find((group) => group.areas.includes(areaOf(row.commandId)))?.titleKey ?? OTHER_GROUP;
  return [...GROUPS.map((group) => group.titleKey), OTHER_GROUP]
    .map((titleKey) => ({ titleKey, rows: rows.filter((row) => groupOf(row) === titleKey) }))
    .filter((group) => group.rows.length > 0);
}

const sameGroups = (left: readonly ShortcutGroup[], right: readonly ShortcutGroup[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export function ShortcutsSheet() {
  const surface = useSurface(SHORTCUTS_DIALOG);
  return surface.isOpen ? <ShortcutsList onClose={surface.close} /> : null;
}

function ShortcutsList({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const commands = useCommands();
  const documentId = useDocumentId() ?? undefined;
  const groups = useKernelValue(() => shortcutGroupsOf(commands, documentId), sameGroups);
  const isMac = isMacPlatform();
  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      className="border-border bg-surface w-96 rounded-lg border p-4 shadow-xl"
    >
      <div data-epdf-shortcuts="">
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-fg text-base font-semibold">
            {t('commands.shortcuts')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('panel.close')}
            title={t('panel.close')}
            className="text-fg-muted hover:bg-hover hover:text-fg grid h-7 w-7 place-items-center rounded-md"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {groups.map((group) => (
          <section key={group.titleKey} className="mt-4">
            <h3 className="text-fg-muted text-xs font-semibold">{t(group.titleKey)}</h3>
            <dl className="mt-1">
              {group.rows.map((row) => (
                <div
                  key={row.commandId}
                  data-epdf-shortcut=""
                  className="flex items-center justify-between gap-4 py-1 text-sm"
                >
                  <dt className="text-fg min-w-0 truncate">{row.label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {row.shortcuts.map((shortcut) => (
                      <kbd
                        key={shortcut}
                        className="border-border-subtle bg-surface-alt text-fg-secondary rounded border px-1.5 py-0.5 font-sans text-xs"
                      >
                        {formatShortcut(shortcut, { isMac })}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
