<!--
  A box drawn by a control of the app's. The box is the layer's: placed and
  turned like the field, the widget's event surface, and the cursor's way in
  (the first element inside that Tab stops at). The control draws in a frame
  of the field's 100% size, scaled with the page; `native` is the field's
  picture and the layer's control, drawn as they are without the app's. A
  click runs the widget's action, after a value the click wrote.
-->
<script setup lang="ts">
import { computed, h, markRaw, toRaw } from 'vue';
import type { Component } from 'vue';
import type { FormFieldValue, FormWidgetItem } from '@embedpdf/plugin-form';
// The write, the action and the cursor's box are the host lens's.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import {
  createFieldControlPress,
  fieldControlPlaceOf,
  isClickClaimed,
  runsActionOnClick,
} from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import FieldNative from './FieldNative.vue';
import { useWidgetActivation } from './composables';
import type { ShownLook } from './field-looks';
import type { FieldControl } from './types';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: FormWidgetItem;
  /** The app's control that draws this box. */
  control: FieldControl;
  colors: FormColors;
  /** The field as it looks now, or `null` while it has nothing to show. */
  look: ShownLook | null;
}>();

const page = usePage();
const form = useCapability(FormHostToken);
const activate = useWidgetActivation(() => props.item.annotationRef);
const { element: box, style: boxStyle } = useWidgetBox(
  () => props.item,
  () => props.colors,
  { custom: true },
);
const focused = useOptionalSelector(
  FormHostToken,
  (host) => host.isWidgetFocused(props.item.ref),
  false,
);
const place = computed(() => fieldControlPlaceOf(props.item, page.value.transform));

// One press for the box's life, reading the box as it is at the write.
const press = createFieldControlPress(
  (value: FormFieldValue) => form.setValue(props.item.fieldRef, value),
  activate,
);

function onClick(event: MouseEvent): void {
  if (!isClickClaimed(event) && runsActionOnClick(props.item)) press.click();
}

// `native` for the control: one component for the box's life, which draws the
// layer's current drawing of it, so a change updates the drawing in place.
const native: Component = markRaw(() =>
  h(FieldNative, {
    item: props.item,
    colors: props.colors,
    place: place.value,
    look: props.look,
  }),
);

/** The control's component, never a reactive proxy of it (a list kept in a `ref`). */
const component = computed(() => toRaw(props.control.component));
</script>

<template>
  <div ref="box" :style="boxStyle" @click="onClick">
    <div :style="place.frameStyle">
      <component
        :is="component"
        :widget="item"
        :frame="place.frame"
        :native="native"
        :set-value="press.setValue"
        :focused="focused"
      />
    </div>
  </div>
</template>
