/**
 * What every field control on a page shares: its box. The box is placed over the field's
 * widget on the page, and is the widget's event surface:
 *
 * - it is always there for the pointer, whatever the control inside allows, so a field that
 *   can't be filled in still runs its PDF actions on enter, exit, press, release, focus and blur
 *   ("may edit this field" and "may receive PDF action events" are different rights);
 * - it keeps a press that begins in it from the Stage below (which would start the active
 *   tool's gesture, or end an edit as a click outside), and still sends it to the field's PDF
 *   "mouse down" action;
 * - a field without a border of its own gets an edge in the form settings' color, so people
 *   see where to fill in (lists and buttons draw their own);
 * - the form's cursor reaches the control here: `focus()` and Tab go through the form, in the
 *   document's order (`bindFieldFocus`); a box with nothing to focus says so (`focusable`), and
 *   the cursor passes over it.
 *
 * Each control (`controls.ts`) is a component whose host element is its box: it extends this
 * class and adds its own control inside. The listeners, the box's style and the colors are
 * `@embedpdf/web`'s, the same for every framework.
 *
 * Inside a control of the app's ({@link EPDF_FORM_EMBEDDED}) a box only fills the place it is
 * given: the app's box around it (`custom-control.ts`) is the widget's event surface and the
 * cursor's way in, and a click this box dealt with is left alone there.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  PLATFORM_ID,
  type Signal,
} from '@angular/core';
import { CapabilityBinding, injectKernelHost, injectPage } from '@embedpdf/angular/runtime';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import {
  bindFieldFocus,
  bindWidgetEvents,
  claimClick,
  isolatePointerDown,
  rectInPixels,
  widgetBoxStyleOf,
  type FormColors,
  type WidgetEventKind,
} from '@embedpdf/web';

/**
 * True for the layer's own control drawn inside a control of the app's (its `native`), false
 * everywhere else. The element the layer's control is drawn in provides it.
 */
export const EPDF_FORM_EMBEDDED = new InjectionToken<boolean>('EPDF_FORM_EMBEDDED', {
  factory: () => false,
});

/** One kind of field widget, as the form layer draws it: `WidgetOf<'text'>`. */
export type WidgetOf<Control extends FormWidgetItem['control']> = Extract<
  FormWidgetItem,
  { control: Control }
>;

@Directive({
  host: { '[style]': 'boxStyle()' },
})
export abstract class FormWidgetBox<Item extends FormWidgetItem> {
  /** The widget: where it is, how it looks, its control and its value. */
  readonly item = input.required<Item>();
  /** The colors the viewer draws fields with: the form settings over the accent. */
  readonly colors = input.required<FormColors>();

  protected readonly page = injectPage('<epdf-form-layer>');
  protected readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The form plugin's host side, for the page's own document. */
  protected readonly formBinding = new CapabilityBinding(
    injectKernelHost('<epdf-form-layer>'),
    () => FormHostToken,
    () => this.page.documentId,
  );
  /** The same, as the capability or `null`: writes, drafts, activation. */
  protected readonly form = this.formBinding.capability;
  /** Whether this is the layer's control inside a control of the app's: it only fills its place. */
  protected readonly embedded = inject(EPDF_FORM_EMBEDDED);

  /** Whether a field without a border of its own gets an edge. A list and a button draw their own. */
  protected readonly drawsEdge: boolean = true;

  /**
   * Whether the box holds a control of the app's: the cursor goes to the first element in it
   * that Tab stops at.
   */
  protected readonly custom: boolean = false;

  /** Whether the box has a control the cursor can go into. */
  protected readonly focusable: Signal<boolean> = computed(() => true);

  /** The box in the page layer's pixels: moves with the camera. */
  protected readonly frame = computed(() => rectInPixels(this.item().box, this.page.transform()));

  /**
   * The box's place over the widget, and its edge. Inside a control of the app's it fills the
   * place it's given, at the widget's size on screen, unturned: the app's box holds the turn.
   */
  protected readonly boxStyle = computed(() => {
    const frame = this.frame();
    return this.embedded
      ? widgetBoxStyleOf(
          { look: this.item().look, accent: this.item().accent },
          { left: 0, top: 0, width: frame.width, height: frame.height },
          this.colors(),
          { edge: this.drawsEdge },
        )
      : widgetBoxStyleOf(this.item(), frame, this.colors(), { edge: this.drawsEdge });
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    if (this.embedded) {
      // The app's box around it sends the widget's events, keeps the press from the Stage and
      // takes the cursor. A click here is this control's: the app's box leaves it alone.
      this.element.addEventListener('click', claimClick);
      inject(DestroyRef).onDestroy(() => this.element.removeEventListener('click', claimClick));
      return;
    }
    // Native listeners on the box: the PDF events of the widget, and the press kept from the
    // Stage. `bindWidgetEvents` sends the press as "mouse down" itself; the press only stops
    // here, so both run.
    const detachEvents = bindWidgetEvents(this.element, (kind) => this.notify(kind));
    const detachPress = isolatePointerDown(this.element);
    inject(DestroyRef).onDestroy(() => {
      detachEvents();
      detachPress();
    });
    // The form's cursor in this box, bound again when the widget or what it takes changes.
    effect((onCleanup) => {
      const item = this.item();
      const form = this.form();
      const widget = item.annotationRef;
      if (!form || !widget || item.disabled) return;
      const radio = item.control === 'toggle' && item.kind === 'radio';
      const focusable = this.focusable();
      onCleanup(
        bindFieldFocus(this.element, form, widget, { radio, custom: this.custom, focusable }),
      );
    });
  }

  /**
   * Run the widget's own action, as a click on it does. ISO 32000 puts the activate action on
   * the widget, whatever its field, and many forms ship "buttons" as read-only text fields with
   * an action that Acrobat runs; a widget without one does nothing.
   */
  protected activate(): void {
    const widget = this.item().annotationRef;
    const form = this.form();
    if (widget && form) void form.activateWidget(widget);
  }

  /** One of the widget's pointer and focus events, for its `/AA` actions. */
  private notify(kind: WidgetEventKind): void {
    const item = this.item();
    const form = this.form();
    if (item.annotationRef && form) form.notifyWidgetEvent(item.fieldRef, item.annotationRef, kind);
  }
}
