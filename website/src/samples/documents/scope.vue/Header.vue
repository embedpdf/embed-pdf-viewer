<!-- The same component in both panes: each talks to the document its <DocumentScope> names. -->
<script setup lang="ts">
import { useDocument } from '@embedpdf/vue/runtime';
import { useStage, useStageState } from '@embedpdf/vue/stage';

const { name, pageCount } = useDocument();
const stage = useStage();
const zoomLevel = useStageState((state) => state.zoomLevel);
</script>

<template>
  <div class="header">
    <strong>{{ name }}</strong>
    {{ pageCount }} pages
    <button type="button" class="button" aria-label="Zoom out" @click="stage.zoomOut()">−</button>
    <output class="readout">{{ Math.round(zoomLevel * 100) }}%</output>
    <button type="button" class="button" aria-label="Zoom in" @click="stage.zoomIn()">+</button>
  </div>
</template>
