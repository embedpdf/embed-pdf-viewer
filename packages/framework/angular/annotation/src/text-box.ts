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
  afterRenderEffect,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  InjectionToken,
  input,
  untracked,
  type Signal,
} from '@angular/core';
import { injectPage } from '@embedpdf/angular/runtime';
import type { Annotation, AnnotationRef, TextItem } from '@embedpdf/plugin-annotation';
import type { AnnotationHostCapability } from '@embedpdf/plugin-annotation/contract/host';
import {
  createTextBoxEditorFollower,
  freeTextBoxOf,
  ownTextBoxOf,
  textBoxEditorScaleOf,
  type OwnTextBox,
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
 *
 * It follows after the render, not before: when typing starts, the look's frame around the
 * element stops being inert in that same render, and an element inside an inert one can't take
 * focus (the editor's `focus()` would do nothing, and the keys would go to the page).
 */
export function bindTextBoxEditor(
  element: HTMLElement,
  annotation: Signal<AnnotationHostCapability | null>,
  item: Signal<TextItem | null>,
  scale: Signal<number>,
): void {
  const follower = createTextBoxEditorFollower<AnnotationRef>();
  afterRenderEffect({
    write: () => {
      const host = annotation();
      const next = item();
      const at = scale();
      untracked(() => follower.follow(element, host, next, at));
    },
  });
  inject(DestroyRef).onDestroy(() => follower.detach());
}

/**
 * The layer's own text box for one free text: the engine's text plate (the box inset by its
 * padding), styled like the box's body and laid out at a legible size (`freeTextBoxOf`). The
 * box's fill and border are the vector scene's, under it. It takes the pointer only while
 * someone types in it; otherwise clicks fall through to the shapes (select, move, resize).
 */
@Directive({
  selector: '[epdfFreeTextBox]',
  // Property by property: the editor's own line height on the element stays.
  host: { '[style]': 'box().style' },
})
export class EpdfFreeTextBox {
  /** The text box, as the plugin lists it for the page. */
  readonly item = input.required<TextItem>({ alias: 'epdfFreeTextBox' });
  /** The outline color while someone types: the chrome's `textOutline`, painted. */
  readonly outline = input.required<string>();

  private readonly page = injectPage('[epdfFreeTextBox]');
  private readonly pixels = pagePixelsOf(this.page);
  protected readonly box = computed(() =>
    freeTextBoxOf(this.item(), this.pixels(), this.outline()),
  );

  constructor() {
    const annotation = annotationHostOf(this.page, '[epdfFreeTextBox]').capability;
    bindTextBoxEditor(
      inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
      annotation,
      this.item,
      computed(() => this.box().scale),
    );
  }
}

/**
 * Your own element as the editor of a text box you draw yourself, in a look
 * (`<ng-template [epdfAnnotation]="isTextBox" let-annotation>`), inside the element that draws
 * the box's frame:
 *
 *   <div class="text-box" [class.editing]="editor.editing()">
 *     <div [epdfRichTextEditor]="annotation" #editor="epdfRichTextEditor"></div>
 *   </div>
 *
 * It draws the runs, turns typing back into runs, keeps the caret when the style changes, and
 * handles pasting, input methods and the format shortcuts; `text.toggleFormat()` and
 * `selection.update()` work on it as on the layer's own box. It gives the element the box's
 * body style (font, size, color and alignment), filling its parent at a legible size
 * (`ownTextBoxOf`), so draw the box's fill, border and padding on the parent; while someone
 * types it takes the pointer. Leave the element empty: the editor fills it.
 */
@Directive({
  selector: '[epdfRichTextEditor]',
  exportAs: 'epdfRichTextEditor',
  // Property by property: the editor's own line height on the element stays.
  host: { '[style]': 'own()?.style ?? null' },
})
export class EpdfRichTextEditor {
  /** The free text annotation this element edits: the template's `let-annotation`. */
  readonly annotation = input.required<Annotation>({ alias: 'epdfRichTextEditor' });

  private readonly page = injectPage('[epdfRichTextEditor]');
  private readonly host = annotationHostOf(this.page, '[epdfRichTextEditor]');
  private readonly lookScale = inject(EPDF_LOOK_SCALE, { optional: true });
  private readonly view = pageViewOf(this.page);
  private readonly pixels = pagePixelsOf(this.page);

  /** The annotation's text box, saved and idle too (this element draws its text), or null. */
  private readonly item = this.host.select(
    (annotation) => annotation.getTextItem(this.annotation().ref, this.view()),
    null,
  );

  /** Pixels per point where the element is: in a scaled look, at the annotation's 100% size. */
  private readonly scale = computed(() =>
    textBoxEditorScaleOf(this.item(), this.pixels(), this.lookScale?.() ?? 1),
  );

  /** The element's style and the scale its text is laid out at, or null while there is no box. */
  protected readonly own: Signal<OwnTextBox | null> = computed(() => {
    const item = this.item();
    return item ? ownTextBoxOf(item, this.scale()) : null;
  });

  /** True while someone types in the box. */
  readonly editing: Signal<boolean> = computed(() => this.item()?.editing ?? false);

  constructor() {
    bindTextBoxEditor(
      inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
      this.host.capability,
      this.item,
      computed(() => this.own()?.scale ?? this.scale()),
    );
  }
}
