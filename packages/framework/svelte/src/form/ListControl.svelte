<!--
  A list: a visible native `<select>` in the field's own look, the settings where it has none.
  It draws its own border, so the box gets no edge.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import { cssText, listBoxControlStyleOf, rectInPixels } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { useCapability } from '../runtime/readers.svelte';
  import FormFocusRing from './FormFocusRing.svelte';
  import NativeListBox from './NativeListBox.svelte';
  import { useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'choice' }>; colors: FormColors } = $props();

  const page = usePage();
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(() => item.annotationRef);
  let focused = $state(false);

  const listStyle = $derived(
    cssText(listBoxControlStyleOf(item, rectInPixels(item.box, page.transform), colors)),
  );

  async function select(values: string[]) {
    await form.setValue(item.fieldRef, { selectedValues: values });
  }
</script>

<WidgetBox {item} {colors} edge={false} onclick={activate}>
  <NativeListBox
    ariaLabel={item.label}
    disabled={item.disabled}
    multi={item.multi}
    options={item.options}
    selected={item.selected}
    onSelect={select}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    style={listStyle}
  />
  <FormFocusRing visible={focused} color={colors.focus} />
</WidgetBox>
