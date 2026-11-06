/**
 * The viewer's own components in your page (`<epdf-button>`, `<epdf-menu>`,
 * `<epdf-icon>`): elements the delivery defines, drawn here by the viewer into
 * each one's own shadow root, with the toolbar's button, the viewer's menu and
 * its icons. So they look and behave like the viewer's own: a command's icon,
 * tooltip and state, or a pressed look of your own (`active`); a menu that
 * opens away from its bar, flips, and takes the menu keys; an icon of the
 * viewer's or of the app's `icons`.
 *
 * The delivery keeps the list of them per viewer ({@link PlacedComponents}),
 * one entry per element, replaced when its attributes or rows change; the
 * shell draws what's on it ({@link PlacedComponentsHost}). Each element is
 * drawn in the viewer's own tree, so it reads the viewer's commands, icons
 * and menus, and the edge of the bar it sits in (`slotted-edges.ts`).
 */
import { useCommand } from '@embedpdf/react/commands';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import { Fragment, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { BarEdgeProvider } from './bar-edge';
import { Icon } from './icons';
import { MenuItem, MenuPopover } from './menu';
import { useSlottedEdges } from './slotted-edges';
import { CommandButton, buttonClass, buttonPart } from './toolbar';
import { useTooltip } from './tooltip';

// ── the list ─────────────────────────────────────────────────────────────────

interface PlacedComponentBase {
  /** The element in the page. */
  readonly host: HTMLElement;
  /** Its shadow root, where the viewer draws it. */
  readonly root: ShadowRoot;
  /** An icon by name, the viewer's or yours. */
  readonly icon: string | null;
  /** Its name, for its tooltip and screen readers. */
  readonly label: string | null;
}

/** `<epdf-button>`: a command's button, or one with an icon and a label of your own. */
export interface PlacedButton extends PlacedComponentBase {
  readonly kind: 'button';
  readonly command: string | null;
  /** Shown pressed (`active`), as a command's button is while its command is active. */
  readonly active: boolean;
}

/** `<epdf-menu>`: a button that opens a menu of its rows. */
export interface PlacedMenu extends PlacedComponentBase {
  readonly kind: 'menu';
  readonly items: readonly PlacedMenuItem[];
}

/** `<epdf-menu-item>`: a row, a command's or one with an icon and text of your own. */
export interface PlacedMenuItem {
  readonly command: string | null;
  readonly icon: string | null;
  /** Its text; a command's label when it has none. */
  readonly label: string;
  /** Shown checked (`active`), as a command's row is while its command is active. */
  readonly active: boolean;
  /** Says the row was picked (the element's `select` event). */
  readonly select: () => void;
}

/** `<epdf-icon>`: one of the viewer's icons or the app's, by its name (`icon`). */
export interface PlacedIcon extends PlacedComponentBase {
  readonly kind: 'icon';
  /** Its width and height in px; `null` for a toolbar button's. */
  readonly size: number | null;
}

export type PlacedComponent = PlacedButton | PlacedMenu | PlacedIcon;

/** The viewer's own components placed in one viewer. */
export interface PlacedComponents {
  /** Every one placed, in the order they were placed. */
  list(): readonly PlacedComponent[];
  /** Calls `listener` whenever the list changes. */
  subscribe(listener: () => void): () => void;
  /** Places a component, or replaces the one with the same `host`. */
  place(component: PlacedComponent): void;
  /** Takes the component of `host` away. */
  remove(host: HTMLElement): void;
}

export function createPlacedComponents(): PlacedComponents {
  let placed: readonly PlacedComponent[] = [];
  const listeners = new Set<() => void>();
  const change = (next: readonly PlacedComponent[]) => {
    placed = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    list: () => placed,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    place(component) {
      const index = placed.findIndex((each) => each.host === component.host);
      change(
        index < 0
          ? [...placed, component]
          : placed.map((each, i) => (i === index ? component : each)),
      );
    },
    remove(host) {
      if (placed.some((each) => each.host === host)) {
        change(placed.filter((each) => each.host !== host));
      }
    },
  };
}

// ── what the page's element says about its command ───────────────────────────

/** The hosts the viewer hid, because their command isn't visible: only those it shows again. */
const hiddenByViewer = new WeakSet<HTMLElement>();

/**
 * Say on the element in the page what its command allows: hidden while the command isn't
 * visible (or there's no such command), and unavailable to the toolbar's keys while it can't run.
 */
function useHostState(host: HTMLElement, command: ResolvedCommand): void {
  const { visible, enabled } = command;
  useLayoutEffect(() => {
    if (!visible && !host.hidden) {
      host.hidden = true;
      hiddenByViewer.add(host);
    } else if (visible && hiddenByViewer.has(host)) {
      host.hidden = false;
      hiddenByViewer.delete(host);
    }
    if (enabled) host.removeAttribute('aria-disabled');
    else host.setAttribute('aria-disabled', 'true');
  }, [host, visible, enabled]);
}

// ── the button ───────────────────────────────────────────────────────────────

/** An icon, else the label as text: what a button of your own shows. */
function Face({ icon, label }: { icon: string | null; label: string | null }) {
  return icon ? (
    <Icon name={icon} size={20} />
  ) : (
    <span className="whitespace-nowrap px-1 text-sm">{label}</span>
  );
}

function CommandOf({
  host,
  commandId,
  active,
}: {
  host: HTMLElement;
  commandId: string;
  active: boolean;
}) {
  const command = useCommand(commandId);
  useHostState(host, command);
  if (!command.visible) return null;
  return (
    <CommandButton
      cmd={active ? { ...command, active } : command}
      variant="icon"
      run={() => void command.run()}
    />
  );
}

/** A button of your own: its click is the element's, for your handler. */
function OwnButton({
  icon,
  label,
  active,
}: {
  icon: string | null;
  label: string | null;
  active: boolean;
}) {
  const tooltip = useTooltip(label ? { label, labelShown: !icon } : null);
  return (
    <>
      <button
        {...tooltip.trigger}
        type="button"
        aria-label={label ?? undefined}
        aria-pressed={active || undefined}
        part={buttonPart(active)}
        className={buttonClass(active)}
      >
        <Face icon={icon} label={label} />
      </button>
      {tooltip.element}
    </>
  );
}

function ButtonView({ button }: { button: PlacedButton }) {
  return button.command ? (
    <CommandOf host={button.host} commandId={button.command} active={button.active} />
  ) : (
    <OwnButton icon={button.icon} label={button.label} active={button.active} />
  );
}

// ── the menu ─────────────────────────────────────────────────────────────────

/** A row of your own, in the shape a menu row reads. */
const ownRowOf = (item: PlacedMenuItem): ResolvedCommand => ({
  id: '',
  label: item.label,
  icon: item.icon ?? undefined,
  shortcuts: [],
  enabled: true,
  active: item.active,
  pressable: false,
  visible: true,
  categories: [],
});

/** A command's row: its icon, label, state and shortcut, unless the item gives its own. */
function CommandRow({
  item,
  commandId,
  onPicked,
}: {
  item: PlacedMenuItem;
  commandId: string;
  onPicked: () => void;
}) {
  const command = useCommand(commandId);
  if (!command.visible) return null;
  const shown = {
    ...command,
    label: item.label || command.label,
    icon: item.icon ?? command.icon,
    active: item.active || command.active,
  };
  return (
    <MenuItem
      command={shown}
      choice={shown.active ? 'checkbox' : 'none'}
      onSelect={() => {
        void command.run();
        item.select();
        onPicked();
      }}
    />
  );
}

function MenuView({ menu }: { menu: PlacedMenu }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const tooltip = useTooltip(menu.label ? { label: menu.label, labelShown: !menu.icon } : null);
  return (
    <span className="relative inline-flex">
      <button
        {...tooltip.trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menu.label ?? undefined}
        part={buttonPart(open)}
        className={buttonClass(open)}
        onClick={() => setOpen((previous) => !previous)}
      >
        <Face icon={menu.icon} label={menu.label} />
      </button>
      {tooltip.element}
      {open && (
        <MenuPopover onClose={close}>
          <div className="min-w-52 p-1">
            {menu.items.map((item, index) =>
              item.command ? (
                <CommandRow key={index} item={item} commandId={item.command} onPicked={close} />
              ) : (
                <MenuItem
                  key={index}
                  command={ownRowOf(item)}
                  choice={item.active ? 'checkbox' : 'none'}
                  onSelect={() => {
                    item.select();
                    close();
                  }}
                />
              ),
            )}
          </div>
        </MenuPopover>
      )}
    </span>
  );
}

// ── the icon ─────────────────────────────────────────────────────────────────

/** One of the viewer's icons, or the app's, in the color of the text around it. */
function IconView({ icon }: { icon: PlacedIcon }) {
  if (!icon.icon) return null;
  return (
    <Icon
      name={icon.icon}
      size={icon.size ?? 20}
      title={icon.label ?? undefined}
      className="block"
    />
  );
}

// ── drawing them ─────────────────────────────────────────────────────────────

/** A key per element in the page, for as long as it lives. */
const keys = new WeakMap<HTMLElement, number>();
let nextKey = 0;
const keyOf = (host: HTMLElement): number => {
  let key = keys.get(host);
  if (key === undefined) {
    key = nextKey++;
    keys.set(host, key);
  }
  return key;
};

/** Draws every component placed in this viewer, each in its own shadow root. */
export function PlacedComponentsHost({ components }: { components: PlacedComponents }) {
  const placed = useSyncExternalStore(components.subscribe, components.list, components.list);
  const edges = useSlottedEdges();
  useSyncExternalStore(edges.subscribe, edges.version, edges.version);
  return (
    <>
      {placed.map((component) => (
        <Fragment key={keyOf(component.host)}>
          {createPortal(
            <BarEdgeProvider value={edges.edgeOf(component.host)}>
              {component.kind === 'button' ? (
                <ButtonView button={component} />
              ) : component.kind === 'menu' ? (
                <MenuView menu={component} />
              ) : (
                <IconView icon={component} />
              )}
            </BarEdgeProvider>,
            component.root,
          )}
        </Fragment>
      ))}
    </>
  );
}
