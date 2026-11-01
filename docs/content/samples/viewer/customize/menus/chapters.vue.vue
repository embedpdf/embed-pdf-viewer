<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  commands: [
    { id: 'acme:chapters', label: 'Chapters', icon: 'book', menu: 'chapters' },
    { id: 'acme:origins', label: 'Origins', run: ({ get }) => get('stage').goToPage(1) },
    { id: 'acme:timeline', label: 'Timeline', run: ({ get }) => get('stage').goToPage(2) },
    { id: 'acme:workflows', label: 'Workflows', run: ({ get }) => get('stage').goToPage(3) },
    { id: 'acme:cover', label: 'Back to the cover', run: ({ get }) => get('stage').goToPage(0) },
  ],
  layout: (layout) =>
    layout
      .addMenu('chapters', [['acme:origins', 'acme:timeline', 'acme:workflows'], ['acme:cover']])
      .add('acme:chapters', { to: 'main', section: 'end' }),
};
</script>

<template>
  <PDFViewer :src="welcome" v-bind="config" style="height: 100%" />
</template>
