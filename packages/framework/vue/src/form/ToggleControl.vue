<!--
  A checkbox or a radio button: the field's picture is the control, so the box
  itself is the checkbox (its role, its tab stop, its keys). A click, Space or
  Enter writes the toggled value, then runs the widget's action (Acrobat's
  order): `@embedpdf/web`'s `pressToggle`. A radio button's label names its
  option, and it says where it comes in its group: its buttons are placed
  apart, so no group element can.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// Writes from the layer go through the host lens, like every control's.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { pressToggle } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import FormFocusRing from './FormFocusRing.vue';
import { useWidgetActivation } from './composables';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: Extract<FormWidgetItem, { control: 'toggle' }>;
  colors: FormColors;
}>();

const form = useCapability(FormHostToken);
const activate = useWidgetActivation(() => props.item.annotationRef);
const { element: box, style: boxStyle } = useWidgetBox(
  () => props.item,
  () => props.colors,
);
const focused = ref(false);
const inGroup = computed(() => (props.item.kind === 'radio' ? props.item.inGroup : null));

const press = () => pressToggle(form, props.item, activate);

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  press();
}
</script>

<template>
  <div
    ref="box"
    :role="item.kind === 'checkbox' ? 'checkbox' : 'radio'"
    :aria-checked="item.checked"
    :aria-label="item.label"
    :aria-posinset="inGroup?.position"
    :aria-setsize="inGroup?.size"
    :tabindex="item.disabled ? -1 : 0"
    :style="[boxStyle, { cursor: item.disabled ? 'default' : 'pointer', outline: 'none' }]"
    @click="press"
    @keydown="onKeydown"
    @focus="focused = true"
    @blur="focused = false"
  >
    <FormFocusRing :visible="focused" :color="colors.focus" />
  </div>
</template>
