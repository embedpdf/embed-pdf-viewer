<script setup lang="ts">
import { PDFViewer, type Layout } from '@cloudpdf/viewer-vue';

defineProps<{ toolbarBelow: boolean }>();

const toolbarAtBottom = (layout: Layout) => layout.place('main', 'bottom');
</script>

<template>
  <!-- A new key mounts a new viewer with the new config. -->
  <PDFViewer
    :key="toolbarBelow ? 'below' : 'above'"
    :src="{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }"
    :layout="toolbarBelow ? toolbarAtBottom : undefined"
    style="height: 100vh"
  />
</template>
