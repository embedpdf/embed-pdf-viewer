<script setup lang="ts">
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-vue';

const features = { forms: false };
const onReady = (viewer: Viewer) => console.log('ready', viewer);
</script>

<template>
  <PDFViewer
    :src="{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }"
    theme="system"
    :features="features"
    style="height: 100vh"
    @ready="onReady"
  />
</template>
