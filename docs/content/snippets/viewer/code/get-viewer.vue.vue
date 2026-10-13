<script setup lang="ts">
import { shallowRef } from 'vue';
import { PDFViewer, ToolbarItem, type Viewer } from '@embedpdf/viewer-vue';
import FirstPage from './FirstPage.vue'; // uses usePDFViewer() inside the viewer

// Outside the viewer: keep it from @ready.
const viewer = shallowRef<Viewer | null>(null);
</script>

<template>
  <button :disabled="!viewer" @click="viewer?.commands.execute('document:print')">Print</button>
  <PDFViewer src="/report.pdf" style="height: 80vh" @ready="viewer = $event">
    <ToolbarItem id="first-page"><FirstPage /></ToolbarItem>
  </PDFViewer>
</template>
