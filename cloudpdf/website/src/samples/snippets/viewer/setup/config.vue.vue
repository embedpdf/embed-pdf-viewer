<script setup lang="ts">
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-vue';

const disable = ['forms'];
const onReady = (viewer: Viewer) => console.log('ready', viewer);
</script>

<template>
  <PDFViewer
    :src="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }"
    theme="system"
    :disable="disable"
    style="height: 100vh"
    @ready="onReady"
  />
</template>
