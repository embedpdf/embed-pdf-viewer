/**
 * The positioned box every control of `<FormLayer>` sits in: where the widget
 * is on the page, the widget's event surface, and the edge a field without a
 * border of its own gets, so people see where to fill in. A composable rather
 * than a component, so each control's template shows its whole box: the
 * toggle's box is its control (a role, a tab stop, keys), the others hold a
 * native control.
 */
import { computed, ref, watch } from 'vue';
import type { CSSProperties, Ref } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// The widget's PDF events go to the plugin's host lens.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import {
  bindWidgetEvents,
  isolatePointerDown,
  rectInPixels,
  widgetBoxStyleOf,
} from '@embedpdf/web';
import type { FormColors, PixelRect } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import { usePage } from '../runtime/page';

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
 * draw their own (a list box) or never have one (a button).
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
  options: { edge?: boolean } = {},
): WidgetBox {
  const page = usePage();
  const form = useCapability(FormHostToken);
  const element = ref<HTMLDivElement | null>(null);
  const edge = options.edge ?? true;

  watch(
    element,
    (box, _previous, onCleanup) => {
      if (!box) return;
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

  const frame = computed(() => rectInPixels(item().box, page.value.transform));
  const style = computed(
    (): CSSProperties => widgetBoxStyleOf(item(), frame.value, colors(), { edge }),
  );

  return { element, frame, style };
}
