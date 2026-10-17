<script setup lang="ts">
import { useAnnotation, useAnnotationDefaults } from '@embedpdf/vue/annotation';

const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

// The pen's color and width, for the strokes that follow.
const annotation = useAnnotation();
const defaults = useAnnotationDefaults('ink');

function pickColor(event: Event) {
  annotation.tools.updateDefaults('ink', { color: (event.target as HTMLInputElement).value });
}

function pickWidth(event: Event) {
  annotation.tools.updateDefaults('ink', {
    strokeWidth: Number((event.target as HTMLInputElement).value),
  });
}
</script>

<template>
  <div class="toolbar">
    <div class="swatches" role="group" aria-label="Pen color">
      <button
        v-for="color in COLORS"
        :key="color"
        type="button"
        class="swatch"
        :aria-label="color"
        :aria-pressed="defaults.color === color"
        :style="{ background: color }"
        @click="annotation.tools.updateDefaults('ink', { color })"
      />
    </div>
    <input
      type="color"
      class="color"
      aria-label="Any color"
      :value="defaults.color ?? '#000000'"
      @input="pickColor"
    />
    <label class="range">
      Width
      <input type="range" min="1" max="12" :value="defaults.strokeWidth ?? 1" @input="pickWidth" />
      <output class="readout">{{ defaults.strokeWidth }} pt</output>
    </label>
  </div>
</template>
