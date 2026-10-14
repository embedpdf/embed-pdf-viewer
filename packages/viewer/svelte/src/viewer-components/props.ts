/** The props of the viewer's own components for yours: `Button`, `Menu` and `MenuItem`. */
import type { Snippet } from 'svelte';

export interface ButtonProps {
  /** Makes it this command's button: its icon, tooltip and state, and it runs it. */
  command?: string;
  /** An icon by name, the viewer's or yours, for a button of your own. */
  icon?: string;
  /** The name of a button of your own, for its tooltip and screen readers. */
  label?: string;
  onclick?: (event: MouseEvent) => void;
  class?: string;
  style?: string;
}

export interface MenuProps {
  /** The icon of the button that opens it, by name. */
  icon?: string;
  /** Its name, for the button's tooltip and screen readers. */
  label: string;
  /** Its rows: `MenuItem`s. */
  children?: Snippet;
}

export interface MenuItemProps {
  /** Makes it this command's row: its icon, label and state, and picking it runs it. */
  command?: string;
  /** An icon by name, the viewer's or yours. */
  icon?: string;
  /** Called when the row is picked. */
  onselect?: () => void;
  /** Its text. */
  children?: Snippet;
}
