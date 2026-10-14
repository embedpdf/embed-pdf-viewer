/**
 * Free text boxes: the element someone types in. `@embedpdf/web`'s text box editor makes an
 * element the editor of a text box (rich text, focus and `contentEditable` following the
 * plugin's `editing`, presses kept inside), and its follower attaches again for another document
 * and takes the box and the scale; this file binds the follower to signals.
 *
 *   [epdfFreeTextBox]       the layer's own text box, one per free text on the page (internal)
 *   [epdfRichTextEditor]    your own element in a look you draw: it becomes the box's editor
 *
 * The editor owns the element's children: Angular puts none in it, and the element is never
 * made again while someone types (the caret would jump).
 */
import {
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  untracked,
  type Signal,
} from '@angular/core';
import { annotationKey } from '@embedpdf/core';
import { injectPage } from '@embedpdf/angular/runtime';
import type { Annotation, AnnotationRef, TextItem } from '@embedpdf/plugin-annotation';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  createTextBoxEditorFollower,
  textBoxEditorScaleOf,
  textBoxStyleOf,
  textPlateInPixels,
  type TextBoxStyle,
} from '@embedpdf/web';
import { annotationHostOf, pagePixelsOf, pageViewOf } from './page-reads';

/**
 * How much the layer scales the look around an element: 1 outside a look, or in one drawn at its
 * size on screen. The layer provides it to each scaled look, so a rich text editor inside draws
 * its text at the annotation's 100% size and lets the look's scale do the rest.
 */
export const EPDF_LOOK_SCALE = new InjectionToken<Signal<number>>('EPDF_LOOK_SCALE');

/**
 * Make `element` the editor of the text box `item()` reads, at `scale()` pixels per point: the
 * binding attaches when the plugin is there (again for another document), and redraws only
 * when the text differs. Call it in an injection context; it lets go when the caller goes.
 */
export function bindTextBoxEditor(
  element: HTMLElement,
  annotation: Signal<AnnotationHostCapability | null>,
  item: Signal<TextItem | null>,
  scale: Signal<number>,
): void {
  const follower = createTextBoxEditorFollower<AnnotationRef>();
  effect(() => {
    const host = annotation();
    const next = item();
    const at = scale();
    untracked(() => follower.follow(element, host, next, at));
  });
  inject(DestroyRef).onDestroy(() => follower.detach());
}

/**
 * The layer's own text box for one free text: the engine's text plate (the box inset by its
 * padding), styled like the box's body, with no padding of its own so its edge is the plate's.
 * The box's fill and border are the vector scene's, under it. It takes the pointer only while
 * someone types in it; otherwise clicks fall through to the shapes (select, move, resize).
 */
@Directive({
  selector: '[epdfFreeTextBox]',
  host: {
    style:
      'position: absolute; box-sizing: border-box; background: transparent; ' +
      'white-space: pre-wrap; overflow-wrap: break-word; overflow-x: hidden; transform-origin: center',
    '[style.left.px]': 'plate().left',
    '[style.top.px]': 'plate().top',
    '[style.width.px]': 'plate().width',
    // Fixed to the plate: the box never grows with its text; it scrolls while typing and clips
    // otherwise, where the baked appearance clips.
    '[style.height.px]': 'plate().height',
    '[style.font-family]': 'look().fontFamily',
    '[style.font-size]': 'look().fontSize',
    '[style.color]': 'look().color',
    '[style.font-weight]': 'look().fontWeight',
    '[style.font-style]': 'look().fontStyle',
    '[style.text-decoration]': 'look().textDecoration',
    '[style.text-align]': 'look().textAlign',
    '[style.overflow-y]': "item().editing ? 'auto' : 'hidden'",
    '[style.outline]': "item().editing ? '1px solid ' + outline() : 'none'",
    '[style.cursor]': "item().editing ? 'text' : 'default'",
    // A plain text box turns about its centre, as the baked appearance does.
    '[style.transform]': "item().rot ? 'rotate(' + item().rot + 'deg)' : null",
    '[style.pointer-events]': "item().editing ? 'auto' : 'none'",
  },
})
export class EpdfFreeTextBox {
  /** The text box, as the plugin lists it for the page. */
  readonly item = input.required<TextItem>({ alias: 'epdfFreeTextBox' });
  /** The outline color while someone types: the chrome's `textOutline`, painted. */
  readonly outline = input.required<string>();

  private readonly page = injectPage('[epdfFreeTextBox]');
  private readonly pixels = pagePixelsOf(this.page);
  protected readonly plate = computed(() => textPlateInPixels(this.item(), this.pixels()));
  protected readonly look = computed(() => textBoxStyleOf(this.item().css, this.plate().scale));

  constructor() {
    const annotation = annotationHostOf(this.page, '[epdfFreeTextBox]').capability;
    bindTextBoxEditor(
      inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
      annotation,
      this.item,
      computed(() => this.plate().scale),
    );
  }
}

/**
 * Your own element as the editor of a text box you draw yourself, in a look
 * (`<ng-template [epdfAnnotation]="isTextBox" let-annotation>`):
 *
 *   <div [epdfRichTextEditor]="annotation" #editor="epdfRichTextEditor"
 *        class="text-box" [class.editing]="editor.editing()"></div>
 *
 * It draws the runs, turns typing back into runs, keeps the caret when the style changes, and
 * handles pasting, input methods and the format shortcuts; `text.toggleFormat()` and
 * `selection.update()` work on it as on the layer's own box. It gives the element the box's
 * body style (font, size, color and alignment), and while someone types it takes the pointer.
 * Leave the element empty: the editor fills it.
 */
@Directive({
  selector: '[epdfRichTextEditor]',
  exportAs: 'epdfRichTextEditor',
  host: {
    '[style.font-family]': 'look()?.fontFamily ?? null',
    '[style.font-size]': 'look()?.fontSize ?? null',
    '[style.color]': 'look()?.color ?? null',
    '[style.font-weight]': 'look()?.fontWeight ?? null',
    '[style.font-style]': 'look()?.fontStyle ?? null',
    '[style.text-decoration]': 'look()?.textDecoration ?? null',
    '[style.text-align]': 'look()?.textAlign ?? null',
    // While typing, the element takes the pointer (the caret, a drag over words).
    '[style.pointer-events]': "editing() ? 'auto' : null",
  },
})
export class EpdfRichTextEditor {
  /** The free text annotation this element edits: the template's `let-annotation`. */
  readonly annotation = input.required<Annotation>({ alias: 'epdfRichTextEditor' });

  private readonly page = injectPage('[epdfRichTextEditor]');
  private readonly host = annotationHostOf(this.page, '[epdfRichTextEditor]');
  private readonly lookScale = inject(EPDF_LOOK_SCALE, { optional: true });
  private readonly view = pageViewOf(this.page);
  private readonly pixels = pagePixelsOf(this.page);

  /** The annotation's text box on the page, or null while there is none. */
  private readonly item = this.host.select(
    (annotation) => {
      const key = annotationKey(this.annotation().ref);
      return (
        annotation
          .listTextItems(this.page.ref, this.view())
          .find((text) => text.ref !== null && annotationKey(text.ref) === key) ?? null
      );
    },
    null,
  );

  /** Pixels per point where the element is: in a scaled look, at the annotation's 100% size. */
  private readonly scale = computed(() =>
    textBoxEditorScaleOf(this.item(), this.pixels(), this.lookScale?.() ?? 1),
  );

  /** The box's body style: font, size, color and alignment, or null while there is no box. */
  protected readonly look: Signal<TextBoxStyle | null> = computed(() => {
    const item = this.item();
    return item ? textBoxStyleOf(item.css, this.scale()) : null;
  });

  /** True while someone types in the box. */
  readonly editing: Signal<boolean> = computed(() => this.item()?.editing ?? false);

  constructor() {
    bindTextBoxEditor(
      inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
      this.host.capability,
      this.item,
      this.scale,
    );
  }
}
