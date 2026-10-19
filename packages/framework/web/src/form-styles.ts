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
import { listBoxStyleOf, scaleOf, textFieldFontPxOf, textFieldStyleOf } from './form-field';
import type { FieldLook, FormColors, ListBoxStyle, TextFieldStyle } from './form-field';
import { legibleScaleOf, legibleShrinkOf } from './legible-text';
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

/**
 * Where a text field's editor shows the text typed in it, so it sits where the engine will draw
 * it (the form plugin's `getTextEditorLayout`), in page points.
 */
export interface TextEditorLayout {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic';
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly padding: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /** A comb's room between characters; it starts at the left padding, whatever the alignment. */
  readonly letterSpacing: number;
  readonly comb: boolean;
}

/** A text field's editor: see-through at rest, the field's own look while focused. */
export type TextFieldEditorStyle = TextFieldStyle & {
  position: 'absolute';
  left: '0';
  top: '0';
  /** The widget's box times the editor's legible scale, in percent with its unit. */
  width: string;
  height: string;
  boxSizing: 'border-box';
  margin: '0';
  /** Draws the editor, laid out at a legible size, at the size of the widget's box. */
  transform: string;
  transformOrigin: '0 0';
  border: 'none';
  outline: string;
  outlineOffset: string;
  padding: string;
  /** In pixels, with its unit: one line of the engine's layout. */
  lineHeight?: string;
  /** `none` with the engine's layout: the browser never fakes a bold or an italic the face doesn't have. */
  fontSynthesis?: 'none';
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
 *
 * It fills the widget's box, laid out at a legible size and drawn back at the
 * box's (`legible-text.ts`), so iOS doesn't zoom the page in when it takes focus.
 *
 * With the engine's `layout` of the text being typed, the editor writes it
 * where the engine will draw it: in the engine's face (mounted), at the size
 * it draws (a fitted size resolved), in the box inside the border, a line of
 * the face's height (one line centred, as the engine centres it).
 */
export function textFieldEditorStyleOf(
  field: Parameters<typeof textFieldStyleOf>[0] & { disabled: boolean },
  frame: PixelRect,
  colors: FormColors,
  focused: boolean,
  layout: TextEditorLayout | null = null,
): TextFieldEditorStyle {
  const scale = scaleOf(field, frame);
  const legible = legibleScaleOf(
    layout ? layout.fontSize * scale : textFieldFontPxOf(field, frame),
  );
  const px = (pixels: number) => `${pixels * legible}px`;
  const pixels = (points: number) => px(points * scale);
  return {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${100 * legible}%`,
    height: `${100 * legible}%`,
    boxSizing: 'border-box',
    margin: '0',
    transform: legibleShrinkOf(legible) ?? 'none',
    transformOrigin: '0 0',
    border: 'none',
    outline: focused ? `${px(2)} solid ${colors.focus}` : 'none',
    outlineOffset: px(-2),
    padding: `0 ${px(2)}`,
    ...textFieldStyleOf(field, frame, colors, legible),
    ...(layout
      ? {
          fontFamily: layout.fontFamily,
          fontWeight: layout.fontWeight,
          fontStyle: layout.fontStyle,
          fontSynthesis: 'none' as const,
          fontSize: pixels(layout.fontSize),
          lineHeight: pixels(layout.lineHeight),
          padding: [
            layout.padding.top,
            layout.padding.right,
            layout.padding.bottom,
            layout.padding.left,
          ]
            .map(pixels)
            .join(' '),
          ...(layout.comb
            ? { letterSpacing: pixels(layout.letterSpacing), textAlign: 'left' as const }
            : {}),
        }
      : {}),
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
