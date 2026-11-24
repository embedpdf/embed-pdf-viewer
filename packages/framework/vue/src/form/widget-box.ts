/**
 * The positioned box every control of `<FormLayer>` sits in: where the widget
 * is on the page, the widget's event surface, and the edge a field without a
 * border of its own gets, so people see where to fill in. A composable rather
 * than a component, so each control's template shows its whole box: the
 * toggle's box is its control (a role, a tab stop, keys), the others hold a
 * native control, and a control of the app's draws inside one.
 */
import { computed, inject, provide, ref, watch } from 'vue';
import type { CSSProperties, InjectionKey, Ref } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// The widget's PDF events go to the plugin's host lens.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import {
  bindFieldFocus,
  bindWidgetEvents,
  claimClick,
  isolatePointerDown,
  rectInPixels,
  widgetBoxStyleOf,
} from '@embedpdf/web';
import type { FormColors, PixelRect } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import { usePage } from '../runtime/page';

const EMBEDDED: InjectionKey<boolean> = Symbol('embedpdf:embedded-form-control');

/**
 * Mark what is drawn below as the layer's own control inside a control of the
 * app's (`native`): the app's box is then the widget's event surface and the
 * cursor's way in, and the layer's box only fills its place.
 */
export function provideEmbeddedControl(): void {
  provide(EMBEDDED, true);
}

/** A control's box: bind `element` with `ref`, and `style` on the same element. */
export interface WidgetBox {
  /** The box element, for the template's `ref`. */
  readonly element: Ref<HTMLDivElement | null>;
  /** Where the widget is on the page, in view px. */
  readonly frame: Readonly<Ref<PixelRect>>;
  /** The box's place, and its edge when the field has no border of its own. */
  readonly style: Readonly<Ref<CSSProperties>>;
}

/**
 * The box of one widget. `edge: false` leaves out the edge for controls that
 * draw their own (a list box) or never have one (a button). The box is also
 * where the form's cursor reaches the control: `focus()` and Tab go through
 * the form, in the document's order (`bindFieldFocus`). A box with nothing to
 * focus says so (`focusable`), and the cursor passes over it. `custom`: the
 * box holds a control of the app's, so it draws no edge, and the cursor goes
 * to the first element in it that Tab stops at.
 *
 * Inside a control of the app's ({@link provideEmbeddedControl}) the box only
 * fills the place it is given: the app's box around it keeps the presses from
 * the page, sends the widget's events and takes the cursor, and a click that
 * passes through this one is left alone there (`claimClick`).
 *
 * The box keeps every press that starts in it from the page below: the Stage
 * listens natively on an ancestor, and a press reaching it would start the
 * active tool's gesture or end an edit as a click outside. Vue's listeners are
 * native too, but the box stops it with `isolatePointerDown`, the same call
 * every framework's form layer makes. The widget's pointer and focus events
 * (its `/AA` actions: enter, exit, down, up, focus, blur) go to the form
 * plugin from native listeners on the box (`bindWidgetEvents`), never the
 * control inside: "may edit this field" and "may receive PDF action events"
 * are different rights, and a session that may not fill still sees hover
 * tooltips. Its own `pointerdown` listener sits on the same element as the
 * isolation, so the stopped press still reaches the field's "mouse down"
 * action. Focus is `focusin`/`focusout`, so a control's own blur (where a
 * text field starts its commit) runs before the box sends "blur", and a blur
 * script sees the committed value.
 */
export function useWidgetBox(
  item: () => FormWidgetItem,
  colors: () => FormColors,
  options: { edge?: boolean; focusable?: () => boolean; custom?: boolean } = {},
): WidgetBox {
  const page = usePage();
  const form = useCapability(FormHostToken);
  const element = ref<HTMLDivElement | null>(null);
  const custom = options.custom ?? false;
  const edge = !custom && (options.edge ?? true);
  const embedded = inject(EMBEDDED, false);

  watch(
    element,
    (box, _previous, onCleanup) => {
      if (!box) return;
      if (embedded) {
        box.addEventListener('click', claimClick);
        onCleanup(() => box.removeEventListener('click', claimClick));
        return;
      }
      const release = isolatePointerDown(box);
      const unbind = bindWidgetEvents(box, (event) => {
        // Read at the event: a widget the engine has just placed gets its address later.
        const { fieldRef, annotationRef } = item();
        if (annotationRef) form.notifyWidgetEvent(fieldRef, annotationRef, event);
      });
      onCleanup(() => {
        release();
        unbind();
      });
    },
    { immediate: true, flush: 'post' },
  );

  watch(
    [
      element,
      () => item().annotationRef,
      () => !embedded && !item().disabled,
      () => {
        const control = item();
        return control.control === 'toggle' && control.kind === 'radio';
      },
      () => options.focusable?.() ?? true,
    ],
    ([box, widget, takesInput, radio, focusable], _previous, onCleanup) => {
      if (box && widget && takesInput) {
        onCleanup(bindFieldFocus(box, form, widget, { radio, custom, focusable }));
      }
    },
    { immediate: true, flush: 'post' },
  );

  const frame = computed(() => rectInPixels(item().box, page.value.transform));
  const style = computed(
    (): CSSProperties =>
      embedded
        ? widgetBoxStyleOf(
            { look: item().look, accent: item().accent },
            { left: 0, top: 0, width: frame.value.width, height: frame.value.height },
            colors(),
            { edge },
          )
        : widgetBoxStyleOf(item(), frame.value, colors(), { edge }),
  );

  return { element, frame, style };
}
