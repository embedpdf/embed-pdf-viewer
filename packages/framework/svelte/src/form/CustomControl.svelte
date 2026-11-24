<!--
  A box drawn by a control of the app's own (`<FormLayer controls>`). The box is the layer's:
  placed and turned like the field, the widget's event surface, and the cursor's way in (the
  first element inside that Tab stops at). The control draws in a frame of the field's 100% size,
  scaled with the page; `native` is the field's picture and the layer's control, drawn as they
  are without the app's (`FieldNative.svelte`).

  A click runs the widget's action, after a value the click wrote (`createFieldControlPress`),
  unless the layer's own control inside dealt with it (`isClickClaimed`). The box listens with
  `onclick`, which Svelte runs after the `onclick` of the control inside, in the order the click
  bubbles: a native listener here would run before the control wrote its value.
-->
<script lang="ts">
  import type { FormFieldValue, FormWidgetItem } from '@embedpdf/plugin-form';
  // Writes from the layer and the box the cursor is in go through the host lens.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import {
    createFieldControlPress,
    cssText,
    fieldControlPlaceOf,
    isClickClaimed,
    runsActionOnClick,
  } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { useCapability, useOptionalSelector } from '../runtime/readers.svelte';
  import type { ShownLook } from './field-looks.svelte';
  import FieldNative from './FieldNative.svelte';
  import type { FieldControl } from './props';
  import { useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    control,
    colors,
    look,
  }: {
    item: FormWidgetItem;
    control: FieldControl;
    colors: FormColors;
    /** How the widget shows now, or `null` while it has nothing to show. */
    look: ShownLook | null;
  } = $props();

  const page = usePage();
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(() => item.annotationRef);
  const focused = useOptionalSelector(
    FormHostToken,
    (host) => host.isWidgetFocused(item.ref),
    false,
  );
  const place = $derived(fieldControlPlaceOf(item, page.transform));
  // One press for the box's life, reading the box as it is at the write.
  const press = createFieldControlPress(
    (value: FormFieldValue) => form.setValue(item.fieldRef, value),
    activate,
  );
  const Control = $derived(control.component);

  function onClick(event: MouseEvent) {
    if (!isClickClaimed(event) && runsActionOnClick(item)) press.click();
  }
</script>

<!-- The layer's own drawing of the box, for the control to keep: `{@render native()}`. -->
{#snippet native()}
  <FieldNative {item} {colors} {look} {place} />
{/snippet}

<WidgetBox {item} {colors} edge={false} custom onclick={onClick}>
  <div style={cssText(place.frameStyle)}>
    <Control
      widget={item}
      frame={place.frame}
      {native}
      setValue={press.setValue}
      focused={focused.current}
    />
  </div>
</WidgetBox>
