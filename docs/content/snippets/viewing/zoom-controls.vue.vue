<script setup lang="ts">
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const { zoomLevel, zoomMode } = useStageState();
</script>

<template>
  <div>
    <button @click="stage.zoomOut()">−</button>
    <span>{{ Math.round(zoomLevel * 100) }}%</span>
    <button @click="stage.zoomIn()">+</button>
    <button :aria-pressed="zoomMode === 'fit-width'" @click="stage.fitWidth()">Fit width</button>
  </div>
</template>
