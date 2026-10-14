/**
 * A free text box's editor on an element: the controller behind the
 * annotation layer's own text boxes and behind a renderer's element that
 * draws one itself. The shared rich-text binding ({@link attachRichTextEditor})
 * renders the runs as inline-styled spans, turns typing back into runs, maps
 * the selection to flat offsets and keeps the caret through a restyle; the
 * browser owns layout, the caret, input methods and the clipboard; the
 * annotation plugin owns the text, the range routing and the write after a
 * pause. This module adds what makes the element a text box of the layer:
 * focus and `contentEditable` follow the plugin's `editing`, never the other
 * way, and a press inside the box stays inside it. A framework binding keeps
 * one {@link createTextBoxEditorFollower} per element and hands it what
 * changed; {@link textBoxEditorScaleOf} is the scale of an editor element a
 * renderer draws itself.
 *
 * The plugin's types are mirrored structurally, so this package stays free of
 * EmbedPDF imports.
 */
import type { PageToPixels } from './page-pixels';
import { rectInPixels } from './page-pixels';
import {
  attachRichTextEditor,
  type RichTextEditorBinding,
  type RichTextEditorCommand,
  type RichTextEditorDocument,
  type RichTextEditorHost,
  type RichTextEditorRange,
} from './rich-text-editor';

/** A text box as the annotation plugin lists it (`listTextItems`): the fields the editor reads. */
export interface TextBoxEditorItem<Ref> {
  readonly id: string;
  /** `null` for a box that isn't written yet: nothing to route typing to. */
  readonly ref: Ref | null;
  readonly richText: RichTextEditorDocument;
  /** True while someone types in this box. */
  readonly editing: boolean;
}

/** The annotation plugin's text-editing calls (its host capability satisfies it). */
export interface TextBoxEditorAnnotation<Ref> {
  draftRichText(ref: Ref, document: RichTextEditorDocument): void;
  setTextSelection(ref: Ref, range: RichTextEditorRange | null): void;
  readonly text: { toggleFormat(format: RichTextEditorCommand): unknown };
  getCssFontFamily(family: string): string;
  getEditingId(): string | null;
}

/** An element made a text box's editor. */
export interface TextBoxEditor<Ref> {
  /**
   * The box as the plugin has it now, at `scale` pixels per point (or `null`
   * while there is none). Call it whenever either changes: the binding
   * redraws only when the text differs (so the caret never jumps while
   * typing), and focus follows `editing`.
   */
  update(item: TextBoxEditorItem<Ref> | null, scale: number): void;
  /** Remove the listeners and the rich-text binding. */
  detach(): void;
}

/**
 * Make `element` the editor of a text box. Typing shows at once and reaches
 * the engine in one write after a pause (or when the edit ends), not one
 * write per keystroke.
 */
export function attachTextBoxEditor<Ref>(
  element: HTMLElement,
  annotation: TextBoxEditorAnnotation<Ref>,
): TextBoxEditor<Ref> {
  let item: TextBoxEditorItem<Ref> | null = null;
  let binding: RichTextEditorBinding | null = null;
  // What the element shows: `null` until the first update states it.
  let shownEditing: boolean | null = null;

  const host: RichTextEditorHost = {
    onInput: (document) => {
      if (item?.ref) annotation.draftRichText(item.ref, document);
    },
    onSelectionChange: (range) => {
      if (item?.ref) annotation.setTextSelection(item.ref, range);
    },
    onCommand: (command) => void annotation.text.toggleFormat(command),
    cssFontFamily: (family) => annotation.getCssFontFamily(family),
  };

  // A press inside the editor stays there: it must not reach the Stage's
  // listener, which reads it as a click outside (and ends the edit). The
  // browser then owns the caret and the drag inside the box.
  const stopPress = (event: Event) => event.stopPropagation();
  // The gesture that opens the editor blurs it to <body> right after it
  // takes focus; while the plugin still edits this box, take focus back. A
  // real click away ends the edit through the interaction hub first.
  const refocus = (event: FocusEvent) => {
    if (
      event.relatedTarget == null &&
      element.isConnected &&
      item &&
      annotation.getEditingId() === item.id
    ) {
      element.focus();
    }
  };
  element.addEventListener('pointerdown', stopPress);
  element.addEventListener('blur', refocus);

  return {
    update(next, scale) {
      item = next;
      if (next && !binding) {
        binding = attachRichTextEditor(element, host, { document: next.richText, scale });
      } else if (!next && binding) {
        binding.detach();
        binding = null;
      }
      // Model → DOM: the binding skips its own echo and redraws, caret kept,
      // for a restyle, a remote edit or a zoom; otherwise it states the line
      // model for the (maybe restyled) font again.
      if (next) binding?.update({ document: next.richText, scale });

      const editing = next?.editing ?? false;
      if (editing === shownEditing) return;
      shownEditing = editing;
      element.contentEditable = editing ? 'true' : 'false';
      if (editing) {
        element.focus();
        // Enter at the top, where the baked appearance anchors the text, so
        // baked → edit → baked never jumps.
        element.scrollTop = 0;
      }
    },
    detach() {
      binding?.detach();
      binding = null;
      element.removeEventListener('pointerdown', stopPress);
      element.removeEventListener('blur', refocus);
    },
  };
}

/** Keeps an element the editor of a text box while what it edits with changes. */
export interface TextBoxEditorFollower<Ref> {
  /**
   * The element, the plugin, the box and the scale as they are now. Call it
   * whenever any of them changes: the editor attaches when there are an
   * element and a plugin, attaches again when either is another one (a
   * document that opens anew), and gets the box and the scale every time.
   */
  follow(
    element: HTMLElement | null,
    annotation: TextBoxEditorAnnotation<Ref> | null,
    item: TextBoxEditorItem<Ref> | null,
    scale: number,
  ): void;
  /** Let go of the element, when the component that drew it goes away. */
  detach(): void;
}

/**
 * A text box editor that follows its inputs: what each framework's binding
 * holds between renders. The update runs right after an attach, in the same
 * call, so the element never shows an editor without its text.
 */
export function createTextBoxEditorFollower<Ref>(): TextBoxEditorFollower<Ref> {
  let attached: {
    element: HTMLElement;
    annotation: TextBoxEditorAnnotation<Ref>;
    editor: TextBoxEditor<Ref>;
  } | null = null;
  const detach = () => {
    attached?.editor.detach();
    attached = null;
  };
  return {
    follow(element, annotation, item, scale) {
      const same =
        attached !== null && attached.element === element && attached.annotation === annotation;
      if (!same) {
        detach();
        if (element && annotation) {
          attached = { element, annotation, editor: attachTextBoxEditor(element, annotation) };
        }
      }
      attached?.editor.update(item, scale);
    },
    detach,
  };
}

/**
 * Pixels per point for an editor element you draw yourself (a renderer's own
 * text box): the box's width on the page over its width in points, or the
 * page's view scale while there is no box. Inside a look the layer scales
 * (`lookScale`, 1 outside one), the element draws at the annotation's 100%
 * size and the look's scale does the rest.
 */
export function textBoxEditorScaleOf(
  item: { box: { x: number; y: number; width: number; height: number } } | null,
  page: PageToPixels & { viewScale: number },
  lookScale: number,
): number {
  const onPage =
    item && item.box.width > 0
      ? rectInPixels(item.box, page).width / item.box.width
      : page.viewScale;
  return onPage / lookScale;
}

/** A free text body's look, as the plugin hands it (`TextItem.css`). */
export interface TextBoxCss {
  fontFamily: string;
  /** In page points. */
  fontSize: number;
  color: string;
  fontWeight: number;
  fontStyle: string;
  textDecoration: string;
  align: 'left' | 'center' | 'right';
  /** The plate's inset from the box, in page points. */
  padding: number;
}

/** A text box's body style as CSS: put it on the editor element. */
export interface TextBoxStyle {
  fontFamily: string;
  /** In pixels, with its unit. */
  fontSize: string;
  color: string;
  fontWeight: number;
  fontStyle: string;
  textDecoration: string;
  textAlign: 'left' | 'center' | 'right';
}

/**
 * A text box's body style at `scale` pixels per point: font, size, color and
 * alignment. No line height: the editor binding states the engine's line
 * model per face on the element itself.
 */
export function textBoxStyleOf(css: TextBoxCss, scale: number): TextBoxStyle {
  return {
    fontFamily: css.fontFamily,
    fontSize: `${css.fontSize * scale}px`,
    color: css.color,
    fontWeight: css.fontWeight,
    fontStyle: css.fontStyle,
    textDecoration: css.textDecoration,
    textAlign: css.align,
  };
}

/** Where a free text's editor element goes, and the scale it draws at. */
export interface TextPlatePixels {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Pixels per page point. */
  scale: number;
}

/**
 * The editor element of a free text box in the page layer's pixels: the
 * engine's text plate (`SetPlateRect` and its `re W n` clip), the box inset
 * by its padding. Place it there with no CSS padding, so its edge is the
 * plate's: CSS padding doesn't clip overflow, and scrolled lines would paint
 * over the border band. The box never grows with its text.
 */
export function textPlateInPixels(
  item: { box: { x: number; y: number; width: number; height: number }; css: { padding: number } },
  page: PageToPixels,
): TextPlatePixels {
  const box = rectInPixels(item.box, page);
  const scale = item.box.width > 0 ? box.width / item.box.width : 1;
  const inset = item.css.padding * scale;
  return {
    left: box.left + inset,
    top: box.top + inset,
    width: Math.max(0, box.width - 2 * inset),
    height: Math.max(0, box.height - 2 * inset),
    scale,
  };
}
