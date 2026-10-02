<script setup lang="ts">
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const zoomLevel = useStageState((state) => state.zoomLevel);
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" aria-label="Zoom out" @click="stage.zoomOut()">−</button>
    <output class="readout">{{ Math.round(zoomLevel * 100) }}%</output>
    <button type="button" class="button" aria-label="Zoom in" @click="stage.zoomIn()">+</button>
    <button type="button" class="button push" @click="stage.fitWidth()">Fit width</button>
  </div>
</template>
