<script setup lang="ts">
import { useStage } from '@embedpdf/vue/stage';

// The view's own controls: the tags follow the view when it zooms and turns.
const stage = useStage();
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="stage.zoomOut()">Zoom out</button>
    <button type="button" class="button" @click="stage.zoomIn()">Zoom in</button>
    <button type="button" class="button" @click="stage.rotateViewBy(90)">Turn the view</button>
  </div>
</template>
