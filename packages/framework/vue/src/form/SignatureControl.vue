<!--
  A signature field. With the signature plugin, an empty field is "sign here"
  (a click makes it the target the next mark goes to), and a signed one asks
  your UI to show its details. Without it, the field is only its picture.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
import { SignatureToken } from '@embedpdf/plugin-signature/contract';
import { FORM_CONTROL_FILL } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: Extract<FormWidgetItem, { control: 'signature' }>;
  colors: FormColors;
}>();

const { element: box, style: boxStyle } = useWidgetBox(
  () => props.item,
  () => props.colors,
);
const signature = useOptionalCapability(SignatureToken);
// The signature plugin knows best whether it's signed (it reads again after
// every new version); the field's own value is the fallback.
const known = useOptionalSelector(
  SignatureToken,
  (capability) => capability.getSignature(props.item.fieldRef)?.signed ?? null,
  null,
);
const signed = computed(() => known.value ?? props.item.signed);
const actionable = computed(
  () => signature.value !== null && (signed.value || !props.item.disabled),
);

function onClick(): void {
  const plugin = signature.value;
  if (!plugin) return;
  if (signed.value) plugin.requestInspection(props.item.fieldRef);
  else plugin.setTarget(props.item.fieldRef);
}
</script>

<template>
  <div ref="box" :style="[boxStyle, { cursor: actionable ? 'pointer' : 'default' }]">
    <button
      v-if="actionable"
      type="button"
      :aria-label="item.label"
      :data-signed="signed ? '' : undefined"
      :style="{
        ...FORM_CONTROL_FILL,
        padding: '0',
        border: '0',
        background: 'transparent',
        cursor: 'inherit',
      }"
      @click="onClick"
    />
  </div>
</template>
