/** The props of the viewer's own components for yours: `Button`, `Menu`, `MenuItem` and `Icon`. */
import type { Snippet } from 'svelte';

export interface ButtonProps {
  /** Makes it this command's button: its icon, tooltip and state, and it runs it. */
  command?: string;
  /** An icon by name, the viewer's or yours, for a button of your own. */
  icon?: string;
  /** The name of a button of your own, for its tooltip and screen readers. */
  label?: string;
  /** Shown pressed, as a command's button is while its command is active. */
  active?: boolean;
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
  /** Shown checked, as a command's row is while its command is active. */
  active?: boolean;
  /** Called when the row is picked. */
  onselect?: () => void;
  /** Its text. */
  children?: Snippet;
}

export interface IconProps {
  /** The icon, by name: the viewer's or one of yours (`icons`). */
  name: string;
  /** Its width and height in px. Default `20`, a toolbar button's icon. */
  size?: number;
  /** What it shows, for screen readers; without one, they skip it. */
  label?: string;
  class?: string;
  style?: string;
}
