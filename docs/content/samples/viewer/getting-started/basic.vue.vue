<template>
  <PDFViewer
    :config="{ src: 'https://snippet.embedpdf.com/ebook.pdf' }"
    :style="{ height: '500px' }"
    @ready="onReady"
  />
</template>

<script setup lang="ts">
import { PDFViewer } from '@embedpdf/vue-pdf-viewer';

function onReady(registry: unknown) {
  console.log('PDF viewer ready!', registry);
}
</script>
