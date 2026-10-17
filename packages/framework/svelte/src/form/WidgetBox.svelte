<!--
  The positioned box every control of `<FormLayer>` sits in: where the widget is on the page, the
  widget's event surface (it always takes the pointer; the control inside gates the edits), and
  the edge a field without a border of its own gets, so people see where to fill in.
  `edge={false}` leaves the edge out for controls that draw their own (a list box) or never have
  one (a button). Every other attribute (a role, a tab stop, keys) goes on the box itself: a
  checkbox's box is its control.

  The box keeps every press that starts in it from the page below. The Stage listens natively on
  an ancestor, and a press reaching it would start the active tool's gesture or end an edit as a
  click outside; Svelte hands `onpointerdown` to the app's root, after the Stage saw the press,
  so the box stops it with a native listener (`isolatePointerDown`). The widget's pointer and
  focus events (its `/AA` actions: enter, exit, down, up, focus, blur) go to the form plugin from
  native listeners on the same box (`bindWidgetEvents`), never the control inside: "may edit this
  field" and "may receive PDF action events" are different rights, and a session that may not
  fill still sees hover tooltips. That `pointerdown` listener sits on the element that stops the
  press, so the stopped press still reaches the field's "mouse down" action. Focus is
  `focusin`/`focusout`, so a control's own blur (where a text field starts its commit) runs
  before the box sends "blur", and a blur script sees the committed value.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // The widget's PDF events go to the plugin's host lens.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import {
    bindWidgetEvents,
    cssText,
    isolatePointerDown,
    rectInPixels,
    widgetBoxStyleOf,
  } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { useCapability } from '../runtime/readers.svelte';

  let {
    item,
    colors,
    edge = true,
    style = '',
    children,
    ...rest
  }: {
    item: FormWidgetItem;
    colors: FormColors;
    edge?: boolean;
    /** More style for the box, after its own place. */
    style?: string;
    children?: Snippet;
  } & Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'children'> = $props();

  const page = usePage();
  const form = useCapability(FormHostToken);
  // The box's own place and edge, then the control's additions (a cursor, an outline).
  const boxStyle = $derived(
    [
      cssText(widgetBoxStyleOf(item, rectInPixels(item.box, page.transform), colors, { edge })),
      style,
    ]
      .filter(Boolean)
      .join('; '),
  );

  function eventSurface(box: HTMLElement): () => void {
    const release = isolatePointerDown(box);
    const unbind = bindWidgetEvents(box, (event) => {
      // Read at the event: a widget the engine has just placed gets its address later.
      const { fieldRef, annotationRef } = item;
      if (annotationRef) form.notifyWidgetEvent(fieldRef, annotationRef, event);
    });
    return () => {
      release();
      unbind();
    };
  }
</script>

<div {@attach eventSurface} {...rest} style={boxStyle}>
  {@render children?.()}
</div>
