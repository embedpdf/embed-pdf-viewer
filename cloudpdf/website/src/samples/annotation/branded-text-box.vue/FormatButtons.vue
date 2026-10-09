<script setup lang="ts">
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const FORMATS = ['bold', 'italic', 'underline'] as const;

// The formatting calls work on your element as they do on the built-in one.
const annotation = useAnnotation();
const hasText = useAnnotationState((state) =>
  state.selected.some((selected) => selected.subtype === 'free-text'),
);
</script>

<template>
  <div class="toolbar">
    <button
      v-for="format in FORMATS"
      :key="format"
      type="button"
      :class="['button', format]"
      :disabled="!hasText"
      @click="annotation.text.toggleFormat(format)"
    >
      {{ format[0]!.toUpperCase() }}
    </button>
  </div>
</template>
