/**
 * The chrome's menus: a layout menu (sections of command ids) and the menus
 * the toolbar derives (the "More" menu, a folded group's), drawn as rows in a
 * popover that opens away from its bar's edge (`menu-placement.ts`). The
 * popover is in the browser's top layer, so no bar, panel or the viewer's own
 * box clips it, and it takes the menu keys from `@embedpdf/web`. Rows resolve
 * live through the command registry: label, icon, shortcut, whether it's the
 * current choice, enabled state; a row whose command isn't visible is gone, and a section
 * with none left goes with its line. A row whose command opens a menu opens
 * it beside it. On a phone (a compact viewer) every menu is a sheet from the
 * bottom of the viewer instead, and a submenu slides in over the menu it
 * opened from, with a row that goes back.
 */
import { formatShortcut, useCommand, useCommands } from '@embedpdf/react/commands';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { useDocumentId, useKernelValue, useOptionalCapability } from '@embedpdf/react/runtime';
import { ShellToken, useShellState } from '@embedpdf/react/shell';
import type { OverflowMenuView } from '@embedpdf/react/toolbar';
import {
  anchoredViewOf,
  attachMenuKeys,
  directionOf,
  fitAnchoredRect,
  isUnavailable,
  observeClientGeometry,
  observeOutsidePress,
  type AnchoredPlacement,
  type AnchoredRect,
} from '@embedpdf/web';
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useBarEdge } from './bar-edge';
import { Icon } from './icons';
import {
  menuPlacementOf,
  submenuKeysOf,
  submenuPlacementOf,
  type MenuAlign,
  type MenuDirection,
} from './menu-placement';
import { Sheet } from './sheet';
import { useLayoutEnv, useMenu } from '../config-context';

// ── the popover ──────────────────────────────────────────────────────────────

/** Px between a menu and its button, and between a menu and the window's edges. */
const MENU_GAP_PX = 4;

/** The `popover` attribute, which React's types don't list yet. */
const POPOVER = { popover: 'manual' } as Record<string, string>;

/** The rows of a menu, the elements the menu keys move between. */
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** A copy no one can use: the toolbar's hidden measurement layer draws every button twice. */
const HIDDEN_COPY_SELECTOR = '[inert], [aria-hidden="true"]';

/** Inside a menu, a menu is a submenu: it opens beside its row. */
const InMenuContext = createContext(false);

/** The rows of `menu` itself, not those of a submenu open inside it. */
const itemsOf = (menu: HTMLElement): HTMLElement[] =>
  [...menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].filter(
    (item) => item.closest('[role="menu"]') === menu,
  );

/** The button that opens the menu: the one beside it that says it has a popup. */
const triggerOf = (holder: HTMLElement, menu: HTMLElement): HTMLElement | null =>
  [...holder.querySelectorAll<HTMLElement>('[aria-haspopup]')].find(
    (candidate) => !menu.contains(candidate),
  ) ?? null;

const boxOf = (element: Element): AnchoredRect => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

/**
 * What a submenu opens beside: its row, across the whole width of the menu
 * the row is in, and raised by the submenu's own padding so its first row
 * lines up with the row that opened it.
 */
function submenuBoxOf(holder: HTMLElement, submenu: HTMLElement): AnchoredRect {
  const row = boxOf(holder);
  const parent = holder.closest('[role="menu"]');
  const across = parent ? boxOf(parent) : row;
  const inset = submenu.clientTop + parseFloat(getComputedStyle(submenu).paddingTop || '0');
  return { x: across.x, y: row.y - inset, width: across.width, height: row.height };
}

/**
 * Place `menu` around `box` in the window: on the side `placement` asks for,
 * or the other side when that has no room, moved to stay on screen, and never
 * taller than the window.
 */
function placeMenu(
  menu: HTMLElement,
  box: AnchoredRect,
  placement: AnchoredPlacement,
  gap: number,
): void {
  const view = anchoredViewOf(menu, 'client');
  if (!view) return;
  menu.style.maxHeight = `${Math.max(0, view.height - 2 * MENU_GAP_PX)}px`;
  const size = { width: menu.offsetWidth, height: menu.offsetHeight };
  const { left, top } = fitAnchoredRect(box, placement, gap, { size, view });
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  // Without the top layer, `position: fixed` starts at the viewer's box (its `contain`):
  // move by however far from the window's origin the menu landed.
  const landed = menu.getBoundingClientRect();
  if (Math.abs(landed.left - left) > 0.5 || Math.abs(landed.top - top) > 0.5) {
    menu.style.left = `${2 * left - landed.left}px`;
    menu.style.top = `${2 * top - landed.top}px`;
  }
}

/**
 * Open `menu` from the button beside it in `holder`: show it in the top layer,
 * place it and keep it placed, close it on a press outside it and its button,
 * and drive it from the keyboard (a submenu's row also opens it with the arrow
 * toward it, and the arrow back closes it). Returns the close.
 */
function openMenu(
  menu: HTMLElement,
  holder: HTMLElement,
  options: {
    readonly placement: (direction: MenuDirection) => AnchoredPlacement;
    readonly nested: boolean;
    readonly close: () => void;
  },
): () => void {
  const { nested, close } = options;
  const trigger = triggerOf(holder, menu);
  const direction = directionOf(holder);
  const placement = options.placement(direction);
  // The menu is named after its button.
  const name =
    trigger?.getAttribute('aria-label') ||
    trigger?.getAttribute('title') ||
    trigger?.textContent?.trim();
  if (name) menu.setAttribute('aria-label', name);

  if (typeof menu.showPopover === 'function') menu.showPopover();
  const place = () =>
    placeMenu(
      menu,
      nested ? submenuBoxOf(holder, menu) : boxOf(holder),
      placement,
      nested ? 0 : MENU_GAP_PX,
    );
  place();
  const resizes = new ResizeObserver(place);
  resizes.observe(menu);
  resizes.observe(holder);
  const stopGeometry = observeClientGeometry(place);

  // A press on the button is the button's own toggle.
  const stopOutside = observeOutsidePress(menu, (event) => {
    if (!trigger || !event.composedPath().includes(trigger)) close();
  });
  const detachKeys = attachMenuKeys(menu, { trigger, close, items: () => itemsOf(menu) });

  const keys = submenuKeysOf(direction);
  const onKeyDown = (event: KeyboardEvent) => {
    const item = event.target as HTMLElement;
    // A key the menu keys took is theirs.
    const free = !event.defaultPrevented;
    const opensMenu = item.getAttribute('aria-haspopup') === 'menu';
    if (free && event.key === keys.open && opensMenu && itemsOf(menu).includes(item)) {
      event.preventDefault();
      // Open the row's submenu, or go into it when it's open already.
      if (item.getAttribute('aria-expanded') !== 'true') item.click();
      else {
        const submenu = item.parentElement?.querySelector<HTMLElement>('[role="menu"]');
        if (submenu) itemsOf(submenu)[0]?.focus();
      }
    } else if (free && event.key === keys.close && nested) {
      event.preventDefault();
      close();
      trigger?.focus();
    }
    // A submenu's keys stay out of the menu it opened from; Tab closes them all.
    if (nested && event.key !== 'Tab') event.stopPropagation();
  };
  menu.addEventListener('keydown', onKeyDown);

  return () => {
    menu.removeEventListener('keydown', onKeyDown);
    detachKeys();
    stopOutside();
    stopGeometry();
    resizes.disconnect();
    if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
      menu.hidePopover();
    }
  };
}

interface MenuPopoverProps {
  children: ReactNode;
  onClose: () => void;
  /** How the menu lines up with its button along the bar. Default `'start'`. */
  align?: MenuAlign;
}

/**
 * A menu's surface, opened by the button beside it in the same parent (the
 * one with `aria-haspopup`). It opens away from its bar's edge, or beside its
 * row in another menu, and closes on Escape, Tab or a press anywhere outside
 * it and its button. In a compact viewer it opens as a sheet.
 */
export function MenuPopover(props: MenuPopoverProps) {
  const probe = useRef<HTMLSpanElement>(null);
  const [usable, setUsable] = useState(false);
  const compact = useLayoutEnv().size === 'compact';
  useLayoutEffect(() => {
    const holder = probe.current?.parentElement;
    if (holder && !holder.closest(HIDDEN_COPY_SELECTOR)) setUsable(true);
  }, []);
  if (!usable) return <span ref={probe} hidden />;
  return compact ? <MenuSheet {...props} /> : <OpenMenu {...props} />;
}

function OpenMenu({ children, onClose, align = 'start' }: MenuPopoverProps) {
  const surface = useRef<HTMLDivElement>(null);
  const edge = useBarEdge();
  const nested = useContext(InMenuContext);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const menu = surface.current;
    const holder = menu?.parentElement;
    if (!menu || !holder) return;
    return openMenu(menu, holder, {
      placement: (direction) =>
        nested ? submenuPlacementOf(direction) : menuPlacementOf(edge, direction, align),
      nested,
      close: () => close.current(),
    });
    // The menu opens once, from where its button is then; it closes by unmounting.
  }, []);
  return (
    <div
      ref={surface}
      {...POPOVER}
      role="menu"
      part="menu"
      className="border-border-subtle bg-elevated text-fg z-50 overflow-y-auto rounded-lg border shadow-xl"
      style={{ position: 'fixed', right: 'auto', bottom: 'auto', margin: 0 }}
    >
      <InMenuContext.Provider value={true}>{children}</InMenuContext.Provider>
    </div>
  );
}

// ── on a phone: the menu as a sheet ──────────────────────────────────────────

/** A submenu open in a menu's sheet, over the menu its row is in. */
interface SheetSubmenu {
  readonly menuId: string;
  readonly label: string;
  /** The row that opened it: it has focus again when the submenu goes. */
  readonly opener: HTMLElement;
  /** Runs when a row in it is picked, as in the menu it opened from. */
  readonly onRun?: () => void;
}

/** In a menu's sheet: how a row opens its submenu, over the menu. Null outside a sheet. */
const MenuSheetContext = createContext<((submenu: SheetSubmenu) => void) | null>(null);

/** The button a menu's sheet opened from: the one beside the sheet that says it has a popup. */
function sheetTriggerOf(menu: HTMLElement): HTMLElement | null {
  const layer = menu.closest<HTMLElement>('[data-epdf-layer]');
  const holder = layer?.parentElement;
  return layer && holder ? triggerOf(holder, layer) : null;
}

/**
 * A menu as a sheet: its rows in a sheet from the bottom of the viewer, which closes on a tap
 * above it, Escape or a pick. A row that opens a menu slides that menu in over this one, with a
 * row (or the arrow key back) that goes back to where it was.
 */
function MenuSheet({ children, onClose }: MenuPopoverProps) {
  const [submenus, setSubmenus] = useState<readonly SheetSubmenu[]>([]);
  const current = useRef(submenus);
  current.current = submenus;
  /** The row to give focus back to once the submenu over it has gone. */
  const refocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  const open = (submenu: SheetSubmenu) => setSubmenus([...current.current, submenu]);
  const back = () => {
    const shown = current.current;
    if (shown.length === 0) return;
    refocus.current = shown[shown.length - 1]!.opener;
    setSubmenus(shown.slice(0, -1));
  };
  // After the menu under it stops being inert (its own layout effect runs first).
  useLayoutEffect(() => {
    refocus.current?.focus();
    refocus.current = null;
  }, [submenus]);

  return (
    // The menus in it are named after their buttons; the sheet holds no focus of its own.
    <Sheet label="" onClose={onClose} trapFocus={false}>
      <MenuSheetContext.Provider value={open}>
        <div className="grid">
          <SheetMenu covered={submenus.length > 0} close={() => close.current()}>
            {children}
          </SheetMenu>
          {submenus.map((submenu, i) => (
            <SheetMenu
              key={i}
              covered={i < submenus.length - 1}
              close={back}
              opener={submenu.opener}
              label={submenu.label}
              onBack={back}
            >
              <MenuBody menuId={submenu.menuId} onRun={submenu.onRun} />
            </SheetMenu>
          ))}
        </div>
      </MenuSheetContext.Provider>
    </Sheet>
  );
}

/**
 * One menu in a menu's sheet: the first one, or a submenu over it with a row that goes back.
 * It takes the menu keys while it's on top; covered, it can't take focus or presses.
 */
function SheetMenu({
  covered,
  close,
  opener,
  label,
  onBack,
  children,
}: {
  covered: boolean;
  close: () => void;
  /** A submenu's row in the menu under it; the first menu's opener is the sheet's button. */
  opener?: HTMLElement;
  label?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const menu = useRef<HTMLDivElement>(null);
  const actions = useRef({ close, onBack });
  actions.current = { close, onBack };
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const trigger = opener ?? sheetTriggerOf(element);
    const name = label ?? (trigger?.getAttribute('aria-label') || trigger?.getAttribute('title'));
    if (name) element.setAttribute('aria-label', name);
    const detachKeys = attachMenuKeys(element, {
      trigger,
      close: () => actions.current.close(),
      items: () => itemsOf(element),
      initialFocus: 'none',
    });
    // The first row takes focus once the sheet is showing: the sheet shows itself after this.
    queueMicrotask(() => {
      if (element.isConnected && !element.inert) {
        itemsOf(element)
          .find((item) => !isUnavailable(item))
          ?.focus();
      }
    });
    const keys = submenuKeysOf(directionOf(element));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const item = event.target as HTMLElement;
      if (event.key === keys.open && item.getAttribute('aria-haspopup') === 'menu') {
        event.preventDefault();
        item.click();
      } else if (event.key === keys.close && actions.current.onBack) {
        event.preventDefault();
        actions.current.onBack();
      }
    };
    element.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('keydown', onKeyDown);
      detachKeys();
    };
    // A menu in the sheet opens once; it goes by unmounting.
  }, []);
  useLayoutEffect(() => {
    if (menu.current) menu.current.inert = covered;
  }, [covered]);
  return (
    <div
      ref={menu}
      role="menu"
      part="menu"
      className={`bg-elevated col-start-1 row-start-1 min-w-0 ${
        onBack
          ? 'starting:translate-x-full rtl:starting:-translate-x-full transition-[translate] duration-200 ease-out motion-reduce:transition-none'
          : ''
      }`}
    >
      {onBack && (
        <div className="p-1 pb-0">
          <button
            type="button"
            tabIndex={-1}
            role="menuitem"
            part="menu-item"
            data-epdf-menu-back=""
            onClick={onBack}
            className={ROW_CLASS}
          >
            <Icon name="chevronLeft" size={16} className="text-fg-muted rtl:-scale-x-100" />
            <span className="flex-1 truncate">{t('menu.back')}</span>
          </button>
          {label && <div className="text-fg px-2.5 pb-1 pt-2 text-sm font-semibold">{label}</div>}
        </div>
      )}
      <InMenuContext.Provider value={true}>{children}</InMenuContext.Provider>
    </div>
  );
}

// ── the button a layout menu opens from ──────────────────────────────────────

/**
 * Which button each open menu opened from, per viewer (its shell). The shell
 * keeps a menu open by its id, and several buttons can name one (the zoom menu
 * in the main bar and in a floating bar): it opens at the button pressed, or
 * at the first one drawn when code opened it.
 */
const openers = new WeakMap<object, Map<string, Element>>();

function openersOf(shell: object): Map<string, Element> {
  let byMenu = openers.get(shell);
  if (!byMenu) {
    byMenu = new Map();
    openers.set(shell, byMenu);
  }
  return byMenu;
}

/**
 * A button that opens the layout menu `menuId`, and the menu when it's open
 * there. `children` draws the button, told whether its menu is open at it; the
 * menu lines up with this wrapper (`className`), so it can hold more than the
 * button, like the zoom field around its chevron.
 */
export function MenuAnchor({
  menuId,
  className = 'relative inline-flex',
  children,
}: {
  menuId: string;
  className?: string;
  children: (open: boolean) => ReactNode;
}) {
  const shell = useOptionalCapability(ShellToken);
  const open = useShellState((state) => state.openMenus.includes(menuId));
  const anchor = useRef<HTMLSpanElement>(null);
  const [, claim] = useReducer((count: number) => count + 1, 0);
  const opener = shell ? openersOf(shell).get(menuId) : undefined;
  const openHere = open && opener !== undefined && opener === anchor.current;

  useLayoutEffect(() => {
    const element = anchor.current;
    if (!shell || !element) return;
    const byMenu = openersOf(shell);
    const current = byMenu.get(menuId);
    if (!open) {
      if (current === element) byMenu.delete(menuId);
      return;
    }
    // Opened from code, or from a button that's gone: the first usable button takes it.
    if (!current?.isConnected && !element.closest(HIDDEN_COPY_SELECTOR)) {
      byMenu.set(menuId, element);
      claim();
    }
  });

  return (
    <span
      ref={anchor}
      className={className}
      // Before the button's own click opens the menu, so the menu opens here.
      onClickCapture={(event) => {
        const target = event.target as Element;
        const pressedButton = target.closest('[aria-haspopup]') && !target.closest('[role="menu"]');
        if (shell && anchor.current && pressedButton) openersOf(shell).set(menuId, anchor.current);
      }}
    >
      {children(openHere)}
      {openHere && (
        <MenuPopover onClose={() => shell?.closeMenu(menuId)}>
          <MenuBody menuId={menuId} onRun={() => shell?.closeMenu(menuId)} />
        </MenuPopover>
      )}
    </span>
  );
}

// ── rows ─────────────────────────────────────────────────────────────────────

/**
 * What the active rows of a section mean: nothing when none of its commands
 * is active, one choice of several (radio) when exactly one is, and a switch
 * per row otherwise (a lone switch, or several that are on together).
 */
type Choice = 'none' | 'radio' | 'checkbox';

const choiceOf = (rows: readonly ResolvedCommand[]): Choice => {
  const choosable = rows.filter((row) => !row.menu);
  const active = choosable.filter((row) => row.active).length;
  if (active === 0) return 'none';
  return active === 1 && choosable.length > 1 ? 'radio' : 'checkbox';
};

const ROLE_OF: Readonly<Record<Choice, string>> = {
  none: 'menuitem',
  radio: 'menuitemradio',
  checkbox: 'menuitemcheckbox',
};

const ROW_BASE =
  'flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

/** A row, the pointer over it and the keyboard on it: the neutral hover look. */
const ROW_CLASS = `${ROW_BASE} text-fg-secondary hover:bg-hover focus-visible:bg-hover aria-disabled:hover:bg-transparent`;

/**
 * The current choice: the accent look of an active toolbar button, so "on" reads the same
 * everywhere and never looks like the row the keyboard is on. The keyboard on it adds an inset
 * ring; with forced colors, where backgrounds go, an outline marks it.
 */
const CHOSEN_ROW_CLASS = `${ROW_BASE} bg-selected text-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent forced-colors:outline-2 forced-colors:outline-solid forced-colors:-outline-offset-2`;

/**
 * One row: the command's icon, label and shortcut, in the accent look when it
 * is the current choice. A row that can't run says why in its tooltip, and
 * stays where it is, greyed out.
 */
export function MenuItem({
  command,
  choice,
  onSelect,
}: {
  command: ResolvedCommand;
  choice: Choice;
  onSelect: () => void;
}) {
  const checked = choice !== 'none' && command.active;
  const [shortcut] = command.shortcuts;
  return (
    <button
      type="button"
      tabIndex={-1}
      role={ROLE_OF[choice]}
      aria-checked={choice === 'none' ? undefined : command.active}
      aria-disabled={command.enabled ? undefined : true}
      title={command.enabled ? undefined : command.disabledReason}
      part={checked ? 'menu-item menu-item-active' : 'menu-item'}
      onClick={() => {
        if (command.enabled) onSelect();
      }}
      className={checked ? CHOSEN_ROW_CLASS : ROW_CLASS}
    >
      {command.icon && (
        <Icon
          name={command.icon}
          size={16}
          accent={command.iconAccent}
          className={checked ? 'text-accent' : 'text-fg-muted'}
        />
      )}
      <span className="flex-1 truncate">{command.label}</span>
      {shortcut && <span className="text-fg-muted ms-4 text-xs">{formatShortcut(shortcut)}</span>}
    </button>
  );
}

/**
 * A row whose command opens a menu: it opens that menu beside it, with a
 * click or the arrow key toward it. Picking a row in there runs `onRun` too,
 * so the whole menu closes.
 */
function SubmenuItem({
  command,
  menuId,
  onRun,
}: {
  command: ResolvedCommand;
  menuId: string;
  onRun?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const openInSheet = useContext(MenuSheetContext);
  return (
    <div role="none" className="relative">
      <button
        type="button"
        tabIndex={-1}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={command.enabled ? undefined : true}
        title={command.enabled ? undefined : command.disabledReason}
        part="menu-item"
        onClick={(event) => {
          if (!command.enabled) return;
          // In a sheet, the submenu slides in over this menu.
          if (openInSheet) {
            openInSheet({ menuId, label: command.label, opener: event.currentTarget, onRun });
          } else setOpen((previous) => !previous);
        }}
        className={`${ROW_CLASS} ${open ? 'bg-hover' : ''}`}
      >
        {command.icon && (
          <Icon
            name={command.icon}
            size={16}
            accent={command.iconAccent}
            className="text-fg-muted"
          />
        )}
        <span className="flex-1 truncate">{command.label}</span>
        <Icon name="chevronRight" size={16} className="text-fg-muted rtl:-scale-x-100" />
      </button>
      {open && (
        <MenuPopover onClose={() => setOpen(false)}>
          <MenuBody menuId={menuId} onRun={onRun} />
        </MenuPopover>
      )}
    </div>
  );
}

/** A layout menu's row, by command id. */
function MenuRow({
  commandId,
  choice,
  onRun,
}: {
  commandId: string;
  choice: Choice;
  onRun?: () => void;
}) {
  const command = useCommand(commandId);
  if (!command.visible) return null;
  if (command.menu) {
    return <SubmenuItem command={command} menuId={command.menu} onRun={onRun} />;
  }
  return (
    <MenuItem
      command={command}
      choice={choice}
      onSelect={() => {
        void command.run();
        onRun?.();
      }}
    />
  );
}

// ── sections ─────────────────────────────────────────────────────────────────

/** A section: its rows as a group named by its title, after a line when it isn't the first. */
function MenuGroup({
  title,
  first,
  children,
}: {
  title?: string;
  first: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <>
      {!first && <div role="separator" className="bg-border-subtle my-1 h-px" />}
      <div role="group" aria-labelledby={title ? titleId : undefined}>
        {title && (
          <div
            id={titleId}
            className="text-fg-muted px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide"
          >
            {title}
          </div>
        )}
        {children}
      </div>
    </>
  );
}

const sameChoices = (left: readonly (Choice | null)[], right: readonly (Choice | null)[]) =>
  left.length === right.length && left.every((choice, i) => choice === right[i]);

/** One section-separated menu, by its id in the layout. */
export function MenuBody({ menuId, onRun }: { menuId: string; onRun?: () => void }) {
  const t = useT();
  const menu = useMenu(menuId);
  const commands = useCommands();
  const documentId = useDocumentId() ?? undefined;
  // Per section, what its active rows mean, or null when it has no visible row: an empty
  // section doesn't leave its title and line behind.
  const choices = useKernelValue(
    () =>
      (menu ?? []).map((section) => {
        const rows = section.items
          .map((id) => commands.resolveCommand(id, documentId))
          .filter((command): command is ResolvedCommand => command?.visible === true);
        return rows.length === 0 ? null : choiceOf(rows);
      }),
    sameChoices,
  );
  if (!menu) return null;
  const shown = menu.flatMap((section, i) => {
    const choice = choices[i];
    return choice ? [{ section, choice }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <div className="min-w-52 p-1">
      {shown.map(({ section, choice }, i) => (
        <MenuGroup
          key={i}
          first={i === 0}
          title={section.title ?? (section.titleKey ? t(section.titleKey) : undefined)}
        >
          {section.items.map((id) => (
            <MenuRow key={id} commandId={id} choice={choice} onRun={onRun} />
          ))}
        </MenuGroup>
      ))}
    </div>
  );
}

/**
 * A menu the toolbar derives (the "More" menu, a folded group's): its
 * sections in bar order, the bar's groups as titled sections, and a row for
 * each command; a command that opens a menu opens it beside its row.
 */
export function ToolbarMenu({ view, align }: { view: OverflowMenuView; align?: MenuAlign }) {
  const t = useT();
  if (!view.isOpen) return null;
  const sections = view.sections.map((section) => {
    const rows = section.rows.flatMap((row) => {
      const command = view.resolve(row.command);
      return command ? [{ row, command }] : [];
    });
    const choice: Choice =
      section.role === 'radio' ? 'radio' : choiceOf(rows.map(({ command }) => command));
    return { section, rows, choice };
  });
  return (
    <MenuPopover onClose={view.close} align={align}>
      <div className="min-w-56 p-1">
        {sections.map(({ section, rows, choice }, i) => (
          <MenuGroup
            key={i}
            first={i === 0}
            title={section.labelKey ? t(section.labelKey) : undefined}
          >
            {rows.map(({ row, command }) =>
              row.type === 'submenu' ? (
                <SubmenuItem
                  key={row.command}
                  command={command}
                  menuId={row.menu}
                  onRun={view.close}
                />
              ) : (
                <MenuItem
                  key={row.command}
                  command={command}
                  choice={choice}
                  onSelect={() => {
                    view.execute(row.command);
                    view.close();
                  }}
                />
              ),
            )}
          </MenuGroup>
        ))}
      </div>
    </MenuPopover>
  );
}
