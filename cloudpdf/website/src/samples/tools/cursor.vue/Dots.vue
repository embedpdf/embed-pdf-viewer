<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { useInteraction } from '@embedpdf/vue/interaction';
import DotLayer from './DotLayer.vue';
import PenCursor from './PenCursor.vue';
import { COLORS } from './dots';
import type { Dot } from './dots';

const interaction = useInteraction();
const color = ref(COLORS[0]);
const penCursor = ref(true);
const dots = ref<readonly Dot[]>([]);

// The tool reads the color at the moment of the click.
let remove: (() => void) | undefined;
onMounted(() => {
  remove = interaction.registerTool({
    id: 'dot',
    cursor: 'crosshair',
    onPointerDown: ({ page, point }) => {
      dots.value = [...dots.value, { id: dots.value.length + 1, page, point, color: color.value }];
      return true;
    },
  });
  interaction.activateTool('dot');
});
onUnmounted(() => remove?.());
</script>

<template>
  <PenCursor v-if="penCursor" :color="color" />
  <div class="toolbar">
    <div class="swatches" role="radiogroup" aria-label="Color">
      <button
        v-for="swatch in COLORS"
        :key="swatch"
        type="button"
        role="radio"
        :aria-checked="swatch === color"
        :aria-label="swatch"
        class="swatch"
        :style="{ background: swatch }"
        @click="color = swatch"
      />
    </div>
    <label class="check">
      <input v-model="penCursor" type="checkbox" />
      Pen cursor
    </label>
  </div>
  <Stage class="stage">
    <template #page="{ page }">
      <RenderLayer />
      <DotLayer :page="page" :dots="dots" />
    </template>
  </Stage>
</template>
