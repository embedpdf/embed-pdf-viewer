<!--
  A list: a visible native list box in the field's own look, the form
  settings' colors where it has none (`@embedpdf/web`'s `listBoxStyleOf`). It
  draws its own border, so the box adds no edge.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// Writes from the layer go through the host lens, like every control's.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { listBoxControlStyleOf } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import FormFocusRing from './FormFocusRing.vue';
import NativeListBox from './NativeListBox.vue';
import { useWidgetActivation } from './composables';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: Extract<FormWidgetItem, { control: 'choice' }>;
  colors: FormColors;
}>();

const form = useCapability(FormHostToken);
const activate = useWidgetActivation(() => props.item.annotationRef);
const {
  element: box,
  frame,
  style: boxStyle,
} = useWidgetBox(
  () => props.item,
  () => props.colors,
  { edge: false },
);
const focused = ref(false);

const select = (values: string[]) =>
  form.setValue(props.item.fieldRef, { selectedValues: values });

const listStyle = computed(() => listBoxControlStyleOf(props.item, frame.value, props.colors));
</script>

<template>
  <div ref="box" :style="boxStyle" @click="activate">
    <NativeListBox
      :label="item.label"
      :disabled="item.disabled"
      :multi="item.multi"
      :options="item.options"
      :selected="item.selected"
      :on-select="select"
      :style="listStyle"
      @focus="focused = true"
      @blur="focused = false"
    />
    <FormFocusRing :visible="focused" :color="colors.focus" />
  </div>
</template>
