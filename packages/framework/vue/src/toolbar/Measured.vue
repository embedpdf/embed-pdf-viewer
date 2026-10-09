<!--
  One element of the measurement layer: reports its width under `measureKey`
  now and whenever it resizes (a new language, a font loading, your CSS).
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { observeWidth } from '@embedpdf/web';

const props = defineProps<{ measureKey: string }>();
const emit = defineEmits<{ width: [key: string, width: number] }>();
defineSlots<{ default?(): unknown }>();

const element = ref<HTMLSpanElement | null>(null);
watch(
  [element, () => props.measureKey],
  ([measured, key], _previous, onCleanup) => {
    if (measured) onCleanup(observeWidth(measured, (width) => emit('width', key, width)));
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <span ref="element" :style="{ display: 'inline-flex', flexShrink: 0 }"><slot /></span>
</template>
