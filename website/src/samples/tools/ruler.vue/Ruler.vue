<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { useInteraction } from '@embedpdf/vue/interaction';
import RulerLayer from './RulerLayer.vue';
import { lengthOf } from './measurement';
import type { Measurement, Point } from './measurement';

const interaction = useInteraction();
const measurement = ref<Measurement | null>(null);
const pointer = ref<Point | null>(null);

// A tool you drag with: the press starts a line, the moves stretch it, the release ends it.
let remove: (() => void) | undefined;
onMounted(() => {
  remove = interaction.registerTool({
    id: 'ruler',
    cursor: 'crosshair',
    touch: 'draw', // one finger measures, two fingers scroll and zoom
    onPointerDown: ({ page, point }) => {
      measurement.value = { page, from: point, to: point };
      return true;
    },
    onPointerMove: ({ point }) => {
      if (measurement.value) measurement.value = { ...measurement.value, to: point };
    },
    onPointerUp: ({ point }) => {
      if (measurement.value) measurement.value = { ...measurement.value, to: point };
    },
    onHover: ({ point }) => {
      pointer.value = point;
    },
  });
  interaction.activateTool('ruler');
});
onUnmounted(() => remove?.());
</script>

<template>
  <div class="toolbar">
    <output class="readout">
      {{ measurement ? lengthOf(measurement) : 'Drag on a page to measure' }}
    </output>
    <output class="readout muted">
      {{ pointer ? `x ${Math.round(pointer.x)} · y ${Math.round(pointer.y)} pt` : '' }}
    </output>
  </div>
  <Stage class="stage">
    <template #page="{ page }">
      <RenderLayer />
      <RulerLayer :page="page" :measurement="measurement" />
    </template>
  </Stage>
</template>
