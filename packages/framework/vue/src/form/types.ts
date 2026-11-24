/**
 * The types an app writes against when it draws form fields its own way: a
 * control (which boxes, with which component) and the props that component
 * gets.
 */
import type { Component } from 'vue';
import type { FormFieldValue, FormSetValueResult, FormWidgetItem } from '@embedpdf/plugin-form';
import type { FieldControlFrame } from '@embedpdf/web';

export type { FieldControlFrame } from '@embedpdf/web';

/**
 * What a control's component gets as props: the box, the frame to draw into,
 * the layer's own control to keep or leave out, and the write.
 */
export interface FieldControlProps {
  /** The box, as `listWidgets()` gives it: its field, its control, its value and what it tells you. */
  widget: FormWidgetItem;
  /**
   * The box you draw into. The layer places, turns and scales it like the
   * field. Fill it (`width: 100%; height: 100%`) and draw at the field's 100%
   * size: your drawing scales with the page.
   */
  frame: FieldControlFrame;
  /**
   * The layer's own control for the box, filling the frame:
   * `<component :is="native" />` keeps the control, to add to it.
   */
  native: Component;
  /**
   * Fill the field in, as `form.setValue()` does for this box's field: the
   * same checks, scripts and undo step. A click that calls it runs the
   * widget's action after the value is written, as in Acrobat.
   */
  setValue: (value: FormFieldValue) => Promise<FormSetValueResult>;
  /** True while the cursor is in this box. */
  focused: boolean;
}

/**
 * One rule: "draw these boxes with this component". `for` gets the box with
 * everything it tells you; the first control that matches wins, and a box no
 * control matches is drawn by the layer.
 *
 * Define the list once, in `<script setup>`: a list written inline in the
 * template is a new one on every render.
 */
export interface FieldControl {
  for: (widget: FormWidgetItem) => boolean;
  /** Gets {@link FieldControlProps}. */
  component: Component;
}
