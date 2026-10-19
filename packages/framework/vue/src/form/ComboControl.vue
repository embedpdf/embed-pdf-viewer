<!--
  A dropdown: an invisible native <select> over the field's picture. The
  browser owns the dropdown, the engine the resting pixels. The select is made
  again whenever the field's selection changes (its `key`), so it opens on the
  field's value.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// Writes from the layer go through the host lens, like every control's.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { FORM_CONTROL_FILL } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import FormFocusRing from './FormFocusRing.vue';
import { useWidgetActivation } from './composables';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: Extract<FormWidgetItem, { control: 'choice' }>;
  colors: FormColors;
}>();

const form = useCapability(FormHostToken);
const activate = useWidgetActivation(() => props.item.annotationRef);
const { element: box, style: boxStyle } = useWidgetBox(
  () => props.item,
  () => props.colors,
);
const focused = ref(false);

const selectionKey = computed(() => props.item.selected.join('\0'));

function onChange(event: Event): void {
  const value = (event.currentTarget as HTMLSelectElement).value;
  void form.setValue(props.item.fieldRef, { value: value || null });
}
</script>

<template>
  <div ref="box" :style="boxStyle" @click="activate">
    <select
      :key="selectionKey"
      :value="item.selected[0] ?? ''"
      :aria-label="item.label"
      :disabled="item.disabled"
      :style="{
        ...FORM_CONTROL_FILL,
        opacity: 0,
        cursor: item.disabled ? 'default' : 'pointer',
        ...(item.disabled ? { pointerEvents: 'none' as const } : {}),
      }"
      @focus="focused = true"
      @blur="focused = false"
      @change="onChange"
    >
      <option v-if="item.selected.length === 0" value="" />
      <option v-for="(option, index) in item.options" :key="index" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <FormFocusRing :visible="focused" :color="colors.focus" />
  </div>
</template>
