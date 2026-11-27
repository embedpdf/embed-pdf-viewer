<!--
  What an empty field shows for its purpose: the layer's paint over the field's
  picture, never the field's value. A control mounts it only for a box that has
  a placeholder, so a form without purposes draws what it drew before. Its
  color is the form's `fields.placeholder` setting.
-->
<script setup lang="ts">
import type { FormWidgetItem } from '@embedpdf/plugin-form';
import { fieldPlaceholderStyleOf } from '@embedpdf/web';
import type { PixelRect } from '@embedpdf/web';
import { useFormSettings } from './composables';

defineProps<{
  item: FormWidgetItem;
  /** Where the widget is on the page, in view px: its box's `frame`. */
  frame: PixelRect;
}>();

const color = useFormSettings((settings) => settings.fields.placeholder);
</script>

<template>
  <span
    aria-hidden="true"
    data-epdf-placeholder=""
    :style="fieldPlaceholderStyleOf(item, frame, color)"
  >
    {{ item.placeholder }}
  </span>
</template>
