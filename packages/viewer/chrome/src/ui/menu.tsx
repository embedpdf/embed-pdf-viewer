/**
 * Menu rendering — a layout menu (sections of command ids) rendered as rows.
 * Reused by the toolbar dropdowns (document / zoom / view) and by the
 * overflow menu's inline submenu expansion, so a command's menu form is
 * identical wherever it surfaces. Rows resolve live through the command
 * registry: label, icon, active tick, enabled state; a row whose command isn't
 * visible is gone, and a section with none left goes with its line.
 */
import { useEffect, useRef, useState } from 'react';
import { useCommand, useCommands } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { useDocumentId, useKernelValue } from '@embedpdf/react/runtime';
import { observeOutsidePress } from '@embedpdf/web';
import { Icon } from './icons';
import { useMenu } from '../config-context';

export function MenuRow({ commandId, onRun }: { commandId: string; onRun?: () => void }) {
  const cmd = useCommand(commandId);
  const commands = useCommands();
  if (!cmd || !cmd.visible) return null;
  return (
    <button
      type="button"
      role={cmd.active ? 'menuitemradio' : 'menuitem'}
      part={cmd.active ? 'menu-item menu-item-active' : 'menu-item'}
      aria-checked={cmd.active || undefined}
      disabled={!cmd.enabled}
      onClick={() => {
        commands.execute(commandId);
        onRun?.();
      }}
      // An active command shows as a tinted row (bg-selected + text-accent),
      // never a checkmark — the icon column stays the command's own icon.
      className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        cmd.active ? 'bg-selected text-accent' : 'text-fg-secondary hover:bg-hover'
      }`}
    >
      {cmd.icon && (
        <Icon
          name={cmd.icon}
          size={16}
          accent={cmd.iconAccent}
          className={cmd.active ? '' : 'text-fg-muted'}
        />
      )}
      <span className="flex-1 truncate">{cmd.label}</span>
    </button>
  );
}

const sameFlags = (left: readonly boolean[], right: readonly boolean[]): boolean =>
  left.length === right.length && left.every((flag, i) => flag === right[i]);

/** One section-separated menu, by its id in the layout. */
export function MenuBody({ menuId, onRun }: { menuId: string; onRun?: () => void }) {
  const t = useT();
  const menu = useMenu(menuId);
  const commands = useCommands();
  const documentId = useDocumentId() ?? undefined;
  // Which sections have a visible row, so an empty one doesn't leave its title and line behind.
  const shows = useKernelValue(
    () =>
      (menu ?? []).map((section) =>
        section.items.some((id) => commands.resolveCommand(id, documentId)?.visible === true),
      ),
    sameFlags,
  );
  if (!menu) return null;
  const sections = menu.filter((_section, i) => shows[i]);
  if (sections.length === 0) return null;
  return (
    <div className="min-w-52 p-1">
      {sections.map((section, i) => {
        const title = section.title ?? (section.titleKey ? t(section.titleKey) : undefined);
        return (
          <div key={i}>
            {i > 0 && <div className="bg-border-subtle my-1 h-px" />}
            {title && (
              <div className="text-fg-muted px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide">
                {title}
              </div>
            )}
            {section.items.map((id) => (
              <MenuRow key={id} commandId={id} onRun={onRun} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The popover shell: a floating surface over a click-away scrim. The scrim
 * covers the viewer (the element is the containing block of `fixed`), so a
 * click anywhere else in the viewer only closes the menu; a press on the page
 * around the viewer closes it too.
 */
export function Popover({
  children,
  onClose,
  align = 'start',
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: 'start' | 'end';
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = root.current;
    return element ? observeOutsidePress(element, () => close.current()) : undefined;
  }, []);
  return (
    <div ref={root} className="contents">
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        part="menu"
        className={`border-border-subtle bg-elevated absolute top-full z-50 mt-1 rounded-lg border shadow-xl ${
          align === 'end' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** A menu dropdown that expands inline (used inside the overflow menu, where a
 *  submenu can't anchor to an off-screen trigger). */
export function InlineSubmenu({ menuId, label }: { menuId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="text-fg-secondary hover:bg-hover flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm"
      >
        <span className="flex-1 truncate">{label}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
      </button>
      {open && (
        <div className="border-border-subtle ml-3 border-l pl-1">
          <MenuBody menuId={menuId} />
        </div>
      )}
    </div>
  );
}
