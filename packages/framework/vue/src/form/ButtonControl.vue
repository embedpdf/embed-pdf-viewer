<!--
  A push button: a native click target over its picture that runs its action.
  A button never has an edge.
-->
<script setup lang="ts">
import type { FormWidgetItem } from '@embedpdf/plugin-form';
import { FORM_CONTROL_FILL } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useWidgetActivation } from './composables';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: Extract<FormWidgetItem, { control: 'button' }>;
  colors: FormColors;
}>();

const activate = useWidgetActivation(() => props.item.annotationRef);
const { element: box, style: boxStyle } = useWidgetBox(
  () => props.item,
  () => props.colors,
  { edge: false },
);
</script>

<template>
  <div ref="box" :style="[boxStyle, { cursor: item.disabled ? 'default' : 'pointer' }]">
    <!-- The box is the event surface; a disabled button must not swallow the pointer. -->
    <button
      type="button"
      :aria-label="item.label"
      :disabled="item.disabled"
      :style="{
        ...FORM_CONTROL_FILL,
        padding: '0',
        border: '0',
        background: 'transparent',
        cursor: 'inherit',
        pointerEvents: item.disabled ? 'none' : 'auto',
      }"
      @click="activate"
    />
  </div>
</template>
