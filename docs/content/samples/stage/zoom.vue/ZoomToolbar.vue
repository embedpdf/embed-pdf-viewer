<script setup lang="ts">
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const { zoomLevel, zoomMode } = useStageState();
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" aria-label="Zoom out" @click="stage.zoomOut()">−</button>
    <output class="readout">{{ Math.round(zoomLevel * 100) }}%</output>
    <button type="button" class="button" aria-label="Zoom in" @click="stage.zoomIn()">+</button>
    <div class="segmented" role="group" aria-label="Fit">
      <button
        type="button"
        :aria-pressed="zoomMode === 'automatic'"
        @click="stage.fitAutomatic()"
      >
        Automatic
      </button>
      <button type="button" :aria-pressed="zoomMode === 'fit-page'" @click="stage.fitPage()">
        Fit page
      </button>
      <button type="button" :aria-pressed="zoomMode === 'fit-width'" @click="stage.fitWidth()">
        Fit width
      </button>
    </div>
  </div>
</template>
