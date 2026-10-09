<script setup lang="ts">
import { onMounted } from 'vue';
import { useStage, useStageState } from '@embedpdf/vue/stage';
import type { RevealZoom } from '@embedpdf/vue/stage';
import { SPOTS, ZOOMS } from './spots';

const active = defineModel<number>('active', { required: true });
const zoom = defineModel<RevealZoom>('zoom', { required: true });

const stage = useStage();
const pageCount = useStageState((state) => state.pageCount);

function reveal(index: number, revealZoom: RevealZoom) {
  const spot = SPOTS[index];
  // The box lands about a third from the top, like a browser's find bar.
  stage.reveal(spot.page, { rect: spot.rect, zoom: revealZoom, anchor: { y: 0.35 } });
  active.value = index;
}

// Open on the first spot.
onMounted(() => {
  stage.reveal(SPOTS[0].page, { rect: SPOTS[0].rect, zoom: 'fit-width', anchor: { y: 0.35 } });
});
</script>

<template>
  <div class="toolbar">
    <div class="spots">
      <button
        v-for="(spot, index) in SPOTS"
        :key="spot.label"
        type="button"
        class="button"
        :aria-pressed="index === active"
        :disabled="spot.page >= pageCount"
        @click="reveal(index, zoom)"
      >
        {{ spot.label }}
      </button>
    </div>
    <div class="segmented" role="group" aria-label="Zoom">
      <button
        v-for="option in ZOOMS"
        :key="option.label"
        type="button"
        :aria-pressed="option.zoom === zoom"
        @click="zoom = option.zoom"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
