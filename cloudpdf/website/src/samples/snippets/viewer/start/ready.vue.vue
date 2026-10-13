<script setup lang="ts">
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-vue';

function onReady(viewer: Viewer) {
  viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
}
</script>

<template>
  <PDFViewer :src="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" style="height: 100vh" @ready="onReady" />
</template>
