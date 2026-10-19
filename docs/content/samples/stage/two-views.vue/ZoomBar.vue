<script setup lang="ts">
import { useStage, useStageState } from '@embedpdf/vue/stage';
import type { OverviewToken } from './overview-token';

const props = defineProps<{ label: string; token?: typeof OverviewToken }>();

// A getter, so the bar follows its `token` prop.
const stage = useStage(() => props.token);
const zoomLevel = useStageState((state) => state.zoomLevel, () => props.token);
</script>

<template>
  <div class="zoom-bar">
    <span class="caption">{{ label }}</span>
    <button type="button" class="button" aria-label="Zoom out" @click="stage.zoomOut()">−</button>
    <output class="readout">{{ Math.round(zoomLevel * 100) }}%</output>
    <button type="button" class="button" aria-label="Zoom in" @click="stage.zoomIn()">+</button>
  </div>
</template>
