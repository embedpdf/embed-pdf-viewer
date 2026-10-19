/**
 * The viewer's own components, for yours: `Button`, `Menu` and `MenuItem`
 * render the viewer's `<epdf-button>`, `<epdf-menu>` and `<epdf-menu-item>`
 * elements, which the viewer draws like its own toolbar buttons and menus.
 * Use them inside the viewer: in a `ToolbarItem`, a `Panel` or a `Region`.
 * The elements come with the viewer, so this module imports nothing from it.
 */
import {
  createElement,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';

export interface ButtonProps {
  /** Makes it this command's button: its icon, tooltip and state, and it runs it. */
  command?: string;
  /** An icon by name, the viewer's or yours, for a button of your own. */
  icon?: string;
  /** The name of a button of your own, for its tooltip and screen readers. */
  label?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  className?: string;
  style?: CSSProperties;
}

/** A toolbar button, the viewer's own. */
export function Button({ command, icon, label, onClick, className, style }: ButtonProps) {
  return createElement('epdf-button', {
    command,
    icon,
    label,
    onClick,
    style,
    // A custom element's class is its `class` attribute: React 18 writes `className` as it is.
    ...(className === undefined ? {} : { class: className }),
  });
}

export interface MenuProps {
  /** The icon of the button that opens it, by name. */
  icon?: string;
  /** Its name, for the button's tooltip and screen readers. */
  label: string;
  /** Its rows: `MenuItem`s. */
  children?: ReactNode;
}

/**
 * A button that opens a menu of `MenuItem`s, the way the viewer's menus open: away from its bar,
 * flipped when there's no room, and up from the bottom on a phone.
 */
export function Menu({ icon, label, children }: MenuProps) {
  return createElement('epdf-menu', { icon, label }, children);
}

export interface MenuItemProps {
  /** Makes it this command's row: its icon, label and state, and picking it runs it. */
  command?: string;
  /** An icon by name, the viewer's or yours. */
  icon?: string;
  /** Called when the row is picked. */
  onSelect?: () => void;
  /** Its text. */
  children?: ReactNode;
}

/** A row in a `Menu`. */
export function MenuItem({ command, icon, onSelect, children }: MenuItemProps) {
  const element = useRef<HTMLElement | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  // The element's `select` event: React passes no handler to a custom element's own events.
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const onPicked = () => select.current?.();
    target.addEventListener('select', onPicked);
    return () => target.removeEventListener('select', onPicked);
  }, []);
  return createElement('epdf-menu-item', { ref: element, command, icon }, children);
}
