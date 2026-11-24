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

  The box is also where the form's cursor reaches the control: `focus()` and Tab go through the
  form, in the document's order (`bindFieldFocus`). A box with nothing to focus says so
  (`focusable={false}`), and the cursor passes over it. `custom`: the box holds a control of the
  app's, and the cursor goes to the first element in it that Tab stops at.

  Inside a control of the app's (`isEmbedded()`) the box only fills the place it is given: the
  app's box around it stops the press, sends the widget's events and takes the cursor. It claims
  every click that passes through it (`claimClick`), so the app's box leaves that click alone. It
  claims with a native listener, which runs while the click bubbles, before the handlers Svelte
  hands to the app's root: the app's box reads the claim from one of those.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // The widget's PDF events go to the plugin's host lens.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import {
    bindFieldFocus,
    bindWidgetEvents,
    claimClick,
    cssText,
    isolatePointerDown,
    rectInPixels,
    widgetBoxStyleOf,
  } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { useCapability } from '../runtime/readers.svelte';
  import { isEmbedded } from './widget';

  let {
    item,
    colors,
    edge = true,
    focusable = true,
    custom = false,
    style = '',
    children,
    ...rest
  }: {
    item: FormWidgetItem;
    colors: FormColors;
    edge?: boolean;
    /** Whether the box has a control the cursor can go into. */
    focusable?: boolean;
    /** The box holds a control of the app's own. */
    custom?: boolean;
    /** More style for the box, after its own place. */
    style?: string;
    children?: Snippet;
  } & Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'children'> = $props();

  const page = usePage();
  const form = useCapability(FormHostToken);
  const embedded = isEmbedded();
  // Where the box goes: the widget's frame on the page, or the place it fills inside a control
  // of the app's, at the frame's size on screen and unturned (the app's box is turned).
  const place = $derived.by(() => {
    const frame = rectInPixels(item.box, page.transform);
    return embedded
      ? widgetBoxStyleOf(
          { look: item.look, accent: item.accent },
          { left: 0, top: 0, width: frame.width, height: frame.height },
          colors,
          { edge },
        )
      : widgetBoxStyleOf(item, frame, colors, { edge });
  });
  // The box's own place and edge, then the control's additions (a cursor, an outline).
  const boxStyle = $derived([cssText(place), style].filter(Boolean).join('; '));

  /** The widget's event surface; inside a control of the app's, only the claim on its clicks. */
  function eventSurface(box: HTMLElement): () => void {
    if (embedded) {
      box.addEventListener('click', claimClick);
      return () => box.removeEventListener('click', claimClick);
    }
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

  /** The form's cursor in this box; runs again when the widget or what it takes changes. */
  function fieldFocus(box: HTMLElement): (() => void) | undefined {
    const widget = item.annotationRef;
    if (embedded || !widget || item.disabled) return undefined;
    const radio = item.control === 'toggle' && item.kind === 'radio';
    return bindFieldFocus(box, form, widget, { radio, custom, focusable });
  }
</script>

<div {@attach eventSurface} {@attach fieldFocus} {...rest} style={boxStyle}>
  {@render children?.()}
</div>
