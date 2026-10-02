<!--
  A signature field. With the signature plugin, an empty field is "sign here" (a click makes it
  the target the next mark goes to), and a signed one asks your UI to show its details
  (`onInspectionRequested`). Without the plugin, or for a read-only empty field, it is only its
  picture.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import { SignatureToken } from '@embedpdf/plugin-signature/contract';
  import type { FormColors } from '@embedpdf/web';
  import { useOptionalCapability, useOptionalSelector } from '../runtime/readers.svelte';
  import { FILL } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'signature' }>; colors: FormColors } = $props();

  const signature = useOptionalCapability(SignatureToken);
  // The signature plugin knows best whether it's signed (it reads again after every new
  // version); the field's own value is the fallback.
  const known = useOptionalSelector(
    SignatureToken,
    (plugin) => plugin.getSignature(item.fieldRef)?.signed ?? null,
    null,
  );
  const signed = $derived(known.current ?? item.signed);
  const actionable = $derived(signature.current !== null && (signed || !item.disabled));

  function onClick() {
    const plugin = signature.current;
    if (!plugin) return;
    if (signed) plugin.requestInspection(item.fieldRef);
    else plugin.setTarget(item.fieldRef);
  }
</script>

<WidgetBox {item} {colors} style="cursor: {actionable ? 'pointer' : 'default'}">
  {#if actionable}
    <button
      type="button"
      aria-label={item.label}
      data-signed={signed ? '' : undefined}
      onclick={onClick}
      style={FILL}
      style:padding="0"
      style:border="0"
      style:background="transparent"
      style:cursor="inherit"
    ></button>
  {/if}
</WidgetBox>
