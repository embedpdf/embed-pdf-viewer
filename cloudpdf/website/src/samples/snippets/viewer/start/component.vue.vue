<script setup lang="ts">
import { PDFViewer, ToolbarItem, type Layout } from '@cloudpdf/viewer-vue';
import DocumentStatus from './DocumentStatus.vue';

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<template>
  <PDFViewer :src="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" :layout="layout" style="height: 100vh">
    <ToolbarItem id="status">
      <DocumentStatus />
    </ToolbarItem>
  </PDFViewer>
</template>
