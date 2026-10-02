/**
 * The styles of the form layer's elements, the same in every framework: the
 * box over each widget, the text field's editor, the list box and the focus
 * ring. Each is a style record (camelCase names, lengths with their units),
 * the shape a style object takes in React, Vue and Angular; Svelte writes one
 * as CSS text with `cssText`. Each is a type alias, so it fits Vue's
 * `CSSProperties` (see the note in `form-field`). The field's own look inside them comes from
 * `form-field` ({@link textFieldStyleOf}, {@link listBoxStyleOf}); its colors
 * from the form settings ({@link formColorsOf}).
 */
import { listBoxStyleOf, textFieldStyleOf } from './form-field';
import type { FieldLook, FormColors, ListBoxStyle, TextFieldStyle } from './form-field';
import type { PixelRect } from './page-pixels';

/** A control that fills the widget's box it sits in: every native control the layer draws. */
export const FORM_CONTROL_FILL = Object.freeze({
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  margin: '0',
} as const);

/** {@link FORM_CONTROL_FILL}'s shape. */
export type FormControlFill = typeof FORM_CONTROL_FILL;

/** The box a widget's control sits in, placed over the widget on the page. */
export type WidgetBoxStyle = {
  position: 'absolute';
  left: string;
  top: string;
  width: string;
  height: string;
  /** Always the widget's event surface: the control inside gates the edits. */
  pointerEvents: 'auto';
  /** The edge of a field without a border of its own, so people see where to fill in. */
  boxShadow?: string;
};

/**
 * The style of a widget's box at `frame` (the widget's box in the page
 * layer's pixels). `edge: false` leaves the edge out, for a control that draws
 * its own (a list box) or never has one (a button).
 */
export function widgetBoxStyleOf(
  widget: { look: Pick<FieldLook, 'border'> },
  frame: PixelRect,
  colors: FormColors,
  { edge = true }: { edge?: boolean } = {},
): WidgetBoxStyle {
  return {
    position: 'absolute',
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    pointerEvents: 'auto',
    ...(edge && widget.look.border === null
      ? { boxShadow: `inset 0 0 0 1px ${colors.border}` }
      : {}),
  };
}

/** A text field's editor: see-through at rest, the field's own look while focused. */
export type TextFieldEditorStyle = FormControlFill &
  TextFieldStyle & {
    border: 'none';
    outline: string;
    outlineOffset: string;
    padding: string;
    resize: 'none';
    cursor: 'text';
    /** 1 while focused, 0 at rest, where the field's picture shows through. */
    opacity: number;
    /** `none` for a disabled field: the box below runs the widget's action. */
    pointerEvents?: 'none';
  };

/**
 * The style of a text field's editor, the `<input>` or `<textarea>` that is
 * always there: focused, it shows the field's text in its own font with a
 * focus ring; at rest it is see-through over the field's picture. A disabled
 * control would swallow clicks, and the box below runs the widget's action
 * (the read-only "button" pattern), so a disabled one lets them through.
 */
export function textFieldEditorStyleOf(
  field: Parameters<typeof textFieldStyleOf>[0] & { disabled: boolean },
  frame: PixelRect,
  colors: FormColors,
  focused: boolean,
): TextFieldEditorStyle {
  return {
    ...FORM_CONTROL_FILL,
    border: 'none',
    outline: focused ? `2px solid ${colors.focus}` : 'none',
    outlineOffset: '-2px',
    padding: '0 2px',
    ...textFieldStyleOf(field, frame, colors),
    resize: 'none',
    cursor: 'text',
    opacity: focused ? 1 : 0,
    ...(field.disabled ? { pointerEvents: 'none' as const } : {}),
  };
}

/** A list box: the visible native `<select>` in the field's own look. */
export type ListBoxControlStyle = FormControlFill &
  ListBoxStyle & {
    padding: string;
    borderRadius: string;
    outline: 'none';
    cursor: 'default' | 'pointer';
    /** `none` for a disabled field: the box below runs the widget's action. */
    pointerEvents?: 'none';
  };

/**
 * The style of a list box's `<select>`, filling the widget's box: the field's
 * own look ({@link listBoxStyleOf}) with its own border, so the box adds no
 * edge. The focus ring is drawn above it ({@link formFocusRingStyleOf}).
 */
export function listBoxControlStyleOf(
  field: Parameters<typeof listBoxStyleOf>[0] & { disabled: boolean },
  frame: PixelRect,
  colors: FormColors,
): ListBoxControlStyle {
  return {
    ...FORM_CONTROL_FILL,
    padding: '0',
    borderRadius: '0',
    outline: 'none',
    ...listBoxStyleOf(field, frame, colors),
    cursor: field.disabled ? 'default' : 'pointer',
    ...(field.disabled ? { pointerEvents: 'none' as const } : {}),
  };
}

/** The focus ring of a field whose control is see-through, or is the box itself. */
export type FormFocusRingStyle = {
  position: 'absolute';
  inset: string;
  zIndex: number;
  boxSizing: 'border-box';
  outline: string;
  outlineOffset: string;
  pointerEvents: 'none';
};

/**
 * The style of a field's focus ring in `color` (the form's focus color): an
 * element of its own above the field's picture and its control. An outline on
 * the box would sit under an opaque child, so a rectangular checkbox or a
 * dropdown would look unfocused while it has the focus.
 */
export function formFocusRingStyleOf(color: string): FormFocusRingStyle {
  return {
    position: 'absolute',
    inset: '0',
    zIndex: 1,
    boxSizing: 'border-box',
    outline: `2px solid ${color}`,
    outlineOffset: '-2px',
    pointerEvents: 'none',
  };
}
