<script setup lang="ts">
import { PDFViewer, ToolbarItem, type Layout } from '@cloudpdf/viewer-vue';
import DocumentStatus from './DocumentStatus.vue';

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<template>
  <PDFViewer :src="{ grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" :layout="layout" style="height: 100vh">
    <ToolbarItem id="status">
      <DocumentStatus />
    </ToolbarItem>
  </PDFViewer>
</template>
