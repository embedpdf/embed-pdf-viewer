<script setup lang="ts">
import { useRender, useRenderSettings } from '@embedpdf/vue/render';
import { useStage, useStageState } from '@embedpdf/vue/stage';

const BUDGETS = [320, 640, 1280];

const render = useRender();
const stage = useStage();
const maxWidth = useRenderSettings((settings) => settings.fullPage.maxWidth);
const tiles = useRenderSettings((settings) => settings.tiles !== false);
const zoomLevel = useStageState((state) => state.zoomLevel);
</script>

<template>
  <div class="toolbar">
    <span class="label">Budget</span>
    <div class="segmented" role="group" aria-label="Whole-page budget">
      <button
        v-for="width in BUDGETS"
        :key="width"
        type="button"
        :aria-pressed="width === maxWidth"
        @click="render.updateSettings({ fullPage: { maxWidth: width } })"
      >
        {{ width }} px
      </button>
    </div>
    <span class="label">Tiles</span>
    <div class="segmented" role="group" aria-label="Tiles">
      <button
        type="button"
        :aria-pressed="tiles"
        @click="render.updateSettings({ tiles: { size: 512 } })"
      >
        On
      </button>
      <button type="button" :aria-pressed="!tiles" @click="render.updateSettings({ tiles: false })">
        Off
      </button>
    </div>
    <div class="zoom">
      <button type="button" class="button" aria-label="Zoom out" @click="stage.zoomOut()">−</button>
      <output class="readout">{{ Math.round(zoomLevel * 100) }}%</output>
      <button type="button" class="button" aria-label="Zoom in" @click="stage.zoomIn()">+</button>
    </div>
  </div>
</template>
