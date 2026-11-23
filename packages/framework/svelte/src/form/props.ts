/**
 * The types an app writes against when it draws a form field's control its own way (a control,
 * the props its component gets, the layer's props), and the props of the form layer's own parts.
 */
import type { Component, Snippet } from 'svelte';
import type { FocusEventHandler } from 'svelte/elements';
import type { FormFieldValue, FormSetValueResult, FormWidgetItem } from '@embedpdf/plugin-form';
import type { FieldControlFrame } from '@embedpdf/web';

/**
 * What a control's component gets as props: the box, the frame to draw into, the layer's own
 * control to keep or leave out, and the write.
 */
export interface FieldControlProps {
  /** The box, as `listWidgets()` gives it: its field, its control, its value and what it tells you. */
  widget: FormWidgetItem;
  /**
   * The box you draw into. The layer places, turns and scales it like the field. Fill it
   * (`width: 100%; height: 100%`) and draw at the field's 100% size: your drawing scales with
   * the page.
   */
  frame: FieldControlFrame;
  /** The layer's own control for the box, filling the frame: `{@render native()}` keeps the control, to add to it. */
  native: Snippet;
  /**
   * Fill the field in, as `form.setValue()` does for this box's field: the same checks, scripts
   * and undo step. A click that calls it runs the widget's action after the value is written, as
   * in Acrobat.
   */
  setValue: (value: FormFieldValue) => Promise<FormSetValueResult>;
  /** True while the cursor is in this box. */
  focused: boolean;
}

/**
 * One rule: "draw these boxes with this component". `for` gets the box with everything it tells
 * you; the first control that matches wins, and a box no control matches is drawn by the layer.
 *
 * Define the list once, in `<script>`.
 */
export interface FieldControl {
  for: (widget: FormWidgetItem) => boolean;
  component: Component<FieldControlProps>;
}

export interface FormLayerProps {
  /** Your own control for some boxes ({@link FieldControl}). Define the list once, in `<script>`. */
  controls?: readonly FieldControl[];
}

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
