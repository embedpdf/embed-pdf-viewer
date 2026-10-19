<!--
  One element of the measurement layer: reports its length along the toolbar
  (its width, or its height in a vertical one) under `measureKey`, now and
  whenever it resizes (a new language, a font loading, your CSS).
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { observeLength } from '@embedpdf/web';
import type { Orientation } from '@embedpdf/web';

const props = defineProps<{ measureKey: string; orientation: Orientation }>();
const emit = defineEmits<{ length: [key: string, length: number] }>();
defineSlots<{ default?(): unknown }>();

const element = ref<HTMLSpanElement | null>(null);
watch(
  [element, () => props.measureKey, () => props.orientation],
  ([measured, key, orientation], _previous, onCleanup) => {
    if (measured) {
      onCleanup(observeLength(measured, orientation, (length) => emit('length', key, length)));
    }
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <span ref="element" :style="{ display: 'inline-flex', flexShrink: 0 }"><slot /></span>
</template>
