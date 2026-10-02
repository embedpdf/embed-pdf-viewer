<!--
  A push button: a transparent native `<button>` over the field's picture that runs the widget's
  action. It never has an edge: the picture is the button.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import type { FormColors } from '@embedpdf/web';
  import { FILL, useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'button' }>; colors: FormColors } = $props();

  const activate = useWidgetActivation(() => item.annotationRef);
</script>

<WidgetBox
  {item}
  {colors}
  edge={false}
  style="cursor: {item.disabled ? 'default' : 'pointer'}"
>
  <!-- The box is the event surface: a disabled button must not swallow the pointer. -->
  <button
    type="button"
    aria-label={item.label}
    disabled={item.disabled}
    onclick={activate}
    style={FILL}
    style:padding="0"
    style:border="0"
    style:background="transparent"
    style:cursor="inherit"
    style:pointer-events={item.disabled ? 'none' : 'auto'}
  ></button>
</WidgetBox>
