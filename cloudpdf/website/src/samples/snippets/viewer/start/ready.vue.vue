<script setup lang="ts">
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-vue';

function onReady(viewer: Viewer) {
  viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
}
</script>

<template>
  <PDFViewer :src="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" style="height: 100vh" @ready="onReady" />
</template>
