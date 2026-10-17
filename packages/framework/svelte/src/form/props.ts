/** The props of the form layer's own parts. */
import type { FocusEventHandler } from 'svelte/elements';

/** One row of a list box: what it shows, and the value it stands for. */
export interface NativeListBoxOption {
  label: string;
  value: string;
}

/** The props of the list box `<FormLayer>` draws over a list field. */
export interface NativeListBoxProps {
  ariaLabel: string;
  disabled: boolean;
  multi: boolean;
  options: readonly NativeListBoxOption[];
  /** The engine's selection: the list shows it whenever it changes. */
  selected: readonly string[];
  /** Write the chosen values; a promise that rejects puts the engine's selection back. */
  onSelect(values: string[]): void | Promise<unknown>;
  onfocus?: FocusEventHandler<HTMLSelectElement>;
  onblur?: FocusEventHandler<HTMLSelectElement>;
  style?: string;
}
