/**
 * A panel's title in its header, when other panels share its side: a button
 * that opens a menu of them, the open one checked, each by its `panel:<id>`
 * command. Picking another opens it in this one's place, since the panels on
 * one side take turns; picking the open one leaves it open.
 */
import { panelCommandOf } from '@embedpdf/core-ui';
import { useCommand } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { useState } from 'react';

import { Icon } from './icons';
import { MenuItem, MenuPopover } from './menu';

export function PanelSwitcher({
  id,
  title,
  panels,
}: {
  /** The open panel. */
  id: string;
  /** Its title. */
  title: string;
  /** The panels on its side that show, this one among them, in layout order. */
  panels: readonly string[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('panels.switch')}
        data-epdf-panel-switcher=""
        onClick={() => setOpen((previous) => !previous)}
        className="text-fg hover:bg-hover -ms-1.5 flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-semibold"
      >
        <span className="truncate">{title}</span>
        <Icon name="chevronDown" size={16} className="text-fg-muted shrink-0" />
      </button>
      {open && (
        <MenuPopover onClose={() => setOpen(false)}>
          <div className="min-w-48 p-1">
            {panels.map((panel) => (
              <PanelRow
                key={panel}
                panel={panel}
                current={panel === id}
                onPicked={() => setOpen(false)}
              />
            ))}
          </div>
        </MenuPopover>
      )}
    </div>
  );
}

/** One panel in the menu: its command's icon and label, checked when it's the open one. */
function PanelRow({
  panel,
  current,
  onPicked,
}: {
  panel: string;
  current: boolean;
  onPicked: () => void;
}) {
  const command = useCommand(panelCommandOf(panel));
  if (!command.visible) return null;
  return (
    <MenuItem
      command={{ ...command, active: current }}
      choice="radio"
      onSelect={() => {
        // Its command toggles it: the open one would close.
        if (!current) void command.run();
        onPicked();
      }}
    />
  );
}
