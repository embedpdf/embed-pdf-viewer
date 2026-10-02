<script setup lang="ts">
import { computed } from 'vue';
import { useStage, useStageSettings, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const { padding, gap } = useStageSettings();
const zoomLevel = useStageState((state) => state.zoomLevel);
// A number grows with the zoom; { px } stays the same on screen.
const onScreen = computed(() => typeof gap.value !== 'number');
const gapSize = computed(() => (typeof gap.value === 'number' ? gap.value : gap.value.px));

const numberOf = (event: Event) => Number((event.target as HTMLInputElement).value);

function setGap(event: Event) {
  const size = numberOf(event);
  stage.updateSettings({ gap: onScreen.value ? { px: size } : size });
}
</script>

<template>
  <div class="toolbar">
    <label class="label">
      Padding
      <input
        class="range"
        type="range"
        :min="0"
        :max="64"
        :value="padding"
        @input="stage.updateSettings({ padding: numberOf($event) })"
      />
      <output class="value">{{ padding }}</output>
    </label>
    <label class="label">
      Gap
      <input class="range" type="range" :min="0" :max="64" :value="gapSize" @input="setGap" />
      <output class="value">{{ gapSize }}</output>
    </label>
    <div class="segmented" role="group" aria-label="Gap unit">
      <button
        type="button"
        :aria-pressed="onScreen"
        @click="stage.updateSettings({ gap: { px: gapSize } })"
      >
        Screen pixels
      </button>
      <button
        type="button"
        :aria-pressed="!onScreen"
        @click="stage.updateSettings({ gap: gapSize })"
      >
        Grows with zoom
      </button>
    </div>
    <div class="zoom">
      <button type="button" class="button" aria-label="Zoom out" @click="stage.zoomOut()">−</button>
      <output class="readout">{{ Math.round(zoomLevel * 100) }}%</output>
      <button type="button" class="button" aria-label="Zoom in" @click="stage.zoomIn()">+</button>
    </div>
  </div>
</template>
