<script setup lang="ts">
import { PDFViewer, ToolbarItem } from '@embedpdf/viewer-vue';
import DocumentStatus from './DocumentStatus.vue';

const layout = (layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<template>
  <PDFViewer src="/report.pdf" :layout="layout" style="height: 100vh">
    <ToolbarItem id="status">
      <DocumentStatus />
    </ToolbarItem>
  </PDFViewer>
</template>
