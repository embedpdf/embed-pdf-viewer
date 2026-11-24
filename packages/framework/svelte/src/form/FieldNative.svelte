<!--
  The layer's own drawing of one box, inside a control of the app's own: what the control gets as
  `native`. The field's picture, where the widget stands, and the layer's control, both at the
  box's size on screen with the frame's scale undone, so they are drawn exactly as they are
  without a control of the app's. The controls below are embedded (`setEmbedded`): the app's box
  around them is the widget's event surface and the cursor's way in.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import { cssText } from '@embedpdf/web';
  import type { FieldControlPlace, FormColors } from '@embedpdf/web';
  import type { ShownLook } from './field-looks.svelte';
  import FieldPicture from './FieldPicture.svelte';
  import NativeControl from './NativeControl.svelte';
  import { setEmbedded } from './widget';

  let {
    item,
    colors,
    look,
    place,
  }: {
    item: FormWidgetItem;
    colors: FormColors;
    /** How the widget shows now, or `null` while it has nothing to show. */
    look: ShownLook | null;
    place: FieldControlPlace;
  } = $props();

  setEmbedded();
</script>

<div style={cssText(place.nativeStyle)}>
  {#if look}
    <FieldPicture {look} place={place.pictureStyle} />
  {/if}
  <NativeControl {item} {colors} />
</div>
