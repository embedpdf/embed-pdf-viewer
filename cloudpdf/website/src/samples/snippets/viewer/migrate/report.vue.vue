<!-- 2.x:

<script setup lang="ts">
import { PDFViewer, type PluginRegistry } from '@embedpdf/vue-pdf-viewer';

const onReady = (registry: PluginRegistry) => console.log('ready', registry);
</script>

<template>
  <PDFViewer
    :config="{
      src: { shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' },
      theme: { preference: 'dark' },
      disabledCategories: ['redaction', 'document-print'],
    }"
    :style="{ height: '100vh' }"
    @ready="onReady"
  />
</template>
-->

<script setup lang="ts">
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-vue';

const onReady = (viewer: Viewer) => console.log('ready', viewer);
</script>

<template>
  <PDFViewer
    :src="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }"
    theme="dark"
    :disable="['redaction', 'documents.print']"
    style="height: 100vh"
    @ready="onReady"
  />
</template>
