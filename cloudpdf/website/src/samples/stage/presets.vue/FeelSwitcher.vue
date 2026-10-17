<script setup lang="ts">
import { useStage, useStageSettings } from '@embedpdf/vue/stage';
import type { StageSettings } from '@embedpdf/vue/stage';

// A preset is an object you keep, and apply with updateSettings().
const READING: Partial<StageSettings> = {
  arrivalAlign: { x: 'start', y: 'start' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'start', y: 'start' },
};
const PRESENTATION: Partial<StageSettings> = {
  arrivalAlign: { x: 'center', y: 'center' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'center', y: 'center' },
};

const stage = useStage();
// The settings say which feel is on: pages land centered in a presentation.
const presentation = useStageSettings((settings) => settings.arrivalAlign.y === 'center');
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Feel">
      <button type="button" :aria-pressed="!presentation" @click="stage.updateSettings(READING)">
        Reading
      </button>
      <button
        type="button"
        :aria-pressed="presentation"
        @click="stage.updateSettings(PRESENTATION)"
      >
        Presentation
      </button>
    </div>
    <div class="pager">
      <button type="button" class="button" @click="stage.previousPage()">‹ Previous</button>
      <button type="button" class="button" @click="stage.nextPage()">Next ›</button>
    </div>
  </div>
</template>
