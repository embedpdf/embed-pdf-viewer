/**
 * Menu rendering — a MenuSchema (a tree of command ids) rendered as rows.
 * Reused by the toolbar dropdowns (document / zoom / page-settings) AND by the
 * overflow menu's inline submenu expansion, so a command's menu form is
 * identical wherever it surfaces. Rows resolve live through the command
 * registry: label, icon, active tick, enabled state.
 */
import { useState } from 'react';
import { useCommand, useCommands } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import type { MenuSchema } from '@embedpdf/react/toolbar';
import { Icon } from './icons';
import { useMenuSchema } from '../config-context';

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
      // v2 shows selection as a blue-tinted row (bg-interactive-selected +
      // text-accent), never a checkmark — the icon column stays the command's
      // own icon.
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

/** One section-separated menu, by schema id. */
export function MenuBody({ menuId, onRun }: { menuId: string; onRun?: () => void }) {
  const t = useT();
  const menu: MenuSchema | undefined = useMenuSchema(menuId);
  if (!menu) return null;
  return (
    <div className="min-w-52 p-1">
      {menu.sections.map((section, i) => (
        <div key={i}>
          {i > 0 && <div className="bg-border-subtle my-1 h-px" />}
          {section.labelKey && (
            <div className="text-fg-muted px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide">
              {t(section.labelKey)}
            </div>
          )}
          {section.items.map((id) => (
            <MenuRow key={id} commandId={id} onRun={onRun} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The popover shell: a floating surface + click-away scrim. */
export function Popover({
  children,
  onClose,
  align = 'start',
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: 'start' | 'end';
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        part="menu"
        className={`border-border-subtle bg-elevated absolute top-full z-50 mt-1 rounded-lg border shadow-xl ${
          align === 'end' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </div>
    </>
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
        onClick={() => setOpen((o) => !o)}
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
