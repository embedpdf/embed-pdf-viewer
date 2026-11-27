<!--
  An image field. With the signature plugin, a press makes the field the target, where the next
  mark the person picks goes in as its picture, empty or filled, as a signature box's press does.
  It runs no script. Without the signature plugin, the field is only its picture.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
import { SignatureToken } from '@embedpdf/plugin-signature/contract';
import { FORM_CONTROL_FILL } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useOptionalCapability } from '../runtime/capabilities';
import FieldPlaceholder from './FieldPlaceholder.vue';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: Extract<FormWidgetItem, { control: 'image' }>;
  colors: FormColors;
}>();

const signature = useOptionalCapability(SignatureToken);
const actionable = computed(() => signature.value !== null && !props.item.disabled);
const {
  element: box,
  frame,
  style: boxStyle,
} = useWidgetBox(
  () => props.item,
  () => props.colors,
  // Without the signature plugin the box has nothing to focus: the cursor passes over it.
  { focusable: () => actionable.value },
);

function onClick(): void {
  signature.value?.setTarget(props.item.fieldRef);
}
</script>

<template>
  <div ref="box" :style="[boxStyle, { cursor: actionable ? 'pointer' : 'default' }]">
    <button
      v-if="actionable"
      type="button"
      :aria-label="item.label"
      :data-has-image="item.hasImage ? '' : undefined"
      :style="{
        ...FORM_CONTROL_FILL,
        padding: '0',
        border: '0',
        background: 'transparent',
        cursor: 'inherit',
      }"
      @click="onClick"
    />
    <FieldPlaceholder v-if="item.placeholder !== null" :item="item" :frame="frame" />
  </div>
</template>
