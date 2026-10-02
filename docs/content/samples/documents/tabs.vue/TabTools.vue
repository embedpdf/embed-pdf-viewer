<!-- The active tab: rename it, move it to the front, and zoom it. Each tab keeps its own zoom. -->
<script setup lang="ts">
import { useDocument, useDocuments } from '@embedpdf/vue/runtime';
import { useStage, useStageState } from '@embedpdf/vue/stage';

const documents = useDocuments();
const { id, name } = useDocument();
const stage = useStage();
const zoomLevel = useStageState((state) => state.zoomLevel);

function rename(event: Event) {
  documents.rename(id.value, (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="toolbar">
    <input class="field" aria-label="Tab name" :value="name ?? ''" @input="rename" />
    <button type="button" class="button" @click="documents.move(id, 0)">Move to front</button>
    <button type="button" class="button" aria-label="Zoom out" @click="stage.zoomOut()">−</button>
    <button type="button" class="button" aria-label="Zoom in" @click="stage.zoomIn()">+</button>
    <output class="readout">{{ Math.round(zoomLevel * 100) }}%</output>
  </div>
</template>
