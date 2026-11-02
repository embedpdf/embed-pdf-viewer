/**
 * The viewer's own components, for yours: `Button`, `Menu`, `MenuItem` and
 * `Icon` render the viewer's `<epdf-button>`, `<epdf-menu>`, `<epdf-menu-item>`
 * and `<epdf-icon>` elements, which the viewer draws like its own toolbar
 * buttons, menus and icons. Use them inside the viewer: in a `ToolbarItem`, a
 * `Panel` or a `Region`. The elements come with the viewer, so this module
 * imports nothing from it.
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
  /** Shown pressed, as a command's button is while its command is active. */
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * `active` as the elements read it: there (the attribute in React 18, the property in React 19,
 * which sets the attribute) or not at all.
 */
const activeOf = (active: boolean | undefined): true | undefined => (active ? true : undefined);

/** A toolbar button, the viewer's own. */
export function Button({ command, icon, label, active, onClick, className, style }: ButtonProps) {
  return createElement('epdf-button', {
    command,
    icon,
    label,
    active: activeOf(active),
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
  /** Shown checked, as a command's row is while its command is active. */
  active?: boolean;
  /** Called when the row is picked. */
  onSelect?: () => void;
  /** Its text. */
  children?: ReactNode;
}

/** A row in a `Menu`. */
export function MenuItem({ command, icon, active, onSelect, children }: MenuItemProps) {
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
  return createElement(
    'epdf-menu-item',
    { ref: element, command, icon, active: activeOf(active) },
    children,
  );
}

export interface IconProps {
  /** The icon, by name: the viewer's or one of yours (`icons`). */
  name: string;
  /** Its width and height in px. Default `20`, a toolbar button's icon. */
  size?: number;
  /** What it shows, for screen readers; without one, they skip it. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** One of the viewer's icons, or yours, in the color of the text around it. */
export function Icon({ name, size, label, className, style }: IconProps) {
  return createElement('epdf-icon', {
    name,
    size,
    label,
    style,
    ...(className === undefined ? {} : { class: className }),
  });
}
