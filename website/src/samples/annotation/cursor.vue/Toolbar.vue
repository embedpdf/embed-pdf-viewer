<script setup lang="ts">
import { onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useAnnotation, useAnnotationDefaults } from '@embedpdf/vue/annotation';

const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

const annotation = useAnnotation();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const defaults = useAnnotationDefaults('ink');

function pick(swatch: string) {
  annotation.tools.updateDefaults('ink', { color: swatch });
  interaction.activateTool('ink');
}

// The pen is active on load: move the pointer over the page.
onMounted(() => interaction.activateTool('ink'));
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :aria-pressed="activeToolId === 'ink'"
      @click="interaction.activateTool('ink')"
    >
      Pen
    </button>
    <div class="swatches" role="group" aria-label="Pen color">
      <button
        v-for="swatch in COLORS"
        :key="swatch"
        type="button"
        class="swatch"
        :aria-label="swatch"
        :aria-pressed="defaults.color === swatch"
        :style="{ background: swatch }"
        @click="pick(swatch)"
      />
    </div>
    <button
      type="button"
      class="button"
      :aria-pressed="activeToolId === 'square'"
      @click="interaction.activateTool('square')"
    >
      Rectangle
    </button>
  </div>
</template>
