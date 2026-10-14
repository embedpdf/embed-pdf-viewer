<!--
  A dropdown: an invisible native `<select>` over the field's picture. The browser owns the
  dropdown, the engine the resting pixels.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import type { FormColors } from '@embedpdf/web';
  import { useCapability } from '../runtime/readers.svelte';
  import FormFocusRing from './FormFocusRing.svelte';
  import { FILL, useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'choice' }>; colors: FormColors } = $props();

  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(() => item.annotationRef);
  let focused = $state(false);

  function onChange(event: Event & { currentTarget: HTMLSelectElement }) {
    void form.setValue(item.fieldRef, { value: event.currentTarget.value || null });
  }
</script>

<WidgetBox {item} {colors} onclick={activate}>
  <!--
    See-through over the picture. One-way: it shows the field's selection whenever that changes;
    between changes the browser owns it, and a change writes through the plugin. A disabled
    select must not swallow the box's clicks.
  -->
  <select
    value={item.selected[0] ?? ''}
    aria-label={item.label}
    disabled={item.disabled}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    onchange={onChange}
    style={FILL}
    style:opacity="0"
    style:cursor={item.disabled ? 'default' : 'pointer'}
    style:pointer-events={item.disabled ? 'none' : undefined}
  >
    {#if item.selected.length === 0}<option value=""></option>{/if}
    {#each item.options as option, index (index)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  <FormFocusRing visible={focused} color={colors.focus} />
</WidgetBox>
