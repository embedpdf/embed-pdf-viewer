<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotationState } from '@embedpdf/vue/annotation';

const { status, selected } = useAnnotationState();

const text = computed(() => {
  if (status.value === 'loading') return 'Loading the annotations…';
  if (selected.value.length > 0) return `Selected: ${selected.value.map((a) => a.subtype).join(', ')}`;
  return 'Click an annotation to select it';
});
</script>

<template>
  <div class="toolbar">
    <p class="hint">{{ text }}</p>
  </div>
</template>
