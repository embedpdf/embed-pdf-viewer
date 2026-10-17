<!-- 2.x:

<script setup lang="ts">
import { PDFViewer, type PluginRegistry } from '@embedpdf/vue-pdf-viewer';

const onReady = (registry: PluginRegistry) => console.log('ready', registry);
</script>

<template>
  <PDFViewer
    :config="{
      src: '/report.pdf',
      theme: { preference: 'dark' },
      disabledCategories: ['redaction', 'document-print'],
    }"
    :style="{ height: '100vh' }"
    @ready="onReady"
  />
</template>
-->

<script setup lang="ts">
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

const onReady = (viewer: Viewer) => console.log('ready', viewer);
</script>

<template>
  <PDFViewer
    src="/report.pdf"
    theme="dark"
    :disable="['redaction', 'documents.print']"
    style="height: 100vh"
    @ready="onReady"
  />
</template>
