<!--
  An image field. With the signature plugin, a press makes the field the target, where the next
  mark the person picks goes in as its picture, empty or filled, as a signature box's press does.
  It runs no script. Without the plugin, or for a read-only field, it is only its picture. An
  empty field with a purpose shows what it is for, button or not. The placeholder's block follows
  the button's with no blank between them: Svelte keeps a blank between two blocks as a text
  node, in every box.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import { SignatureToken } from '@embedpdf/plugin-signature/contract';
  import type { FormColors } from '@embedpdf/web';
  import { useOptionalCapability } from '../runtime/readers.svelte';
  import FieldPlaceholder from './FieldPlaceholder.svelte';
  import { FILL } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'image' }>; colors: FormColors } = $props();

  const signature = useOptionalCapability(SignatureToken);
  const actionable = $derived(signature.current !== null && !item.disabled);

  function onClick() {
    signature.current?.setTarget(item.fieldRef);
  }
</script>

<WidgetBox
  {item}
  {colors}
  focusable={actionable}
  style="cursor: {actionable ? 'pointer' : 'default'}"
>
  {#if actionable}
    <button
      type="button"
      aria-label={item.label}
      data-has-image={item.hasImage ? '' : undefined}
      onclick={onClick}
      style={FILL}
      style:padding="0"
      style:border="0"
      style:background="transparent"
      style:cursor="inherit"
    ></button>
  {/if}{#if item.placeholder !== null}<FieldPlaceholder {item} />{/if}
</WidgetBox>
