<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  layout: (layout) =>
    layout
      .place('main', 'bottom')
      .remove('zoom', { from: 'main' })
      .addBar('zoom', {
        place: { float: 'bottom-end' },
        center: [[{ custom: 'zoom' }]],
      }),
};
</script>

<template>
  <PDFViewer :src="welcome" v-bind="config" style="height: 100%" />
</template>
