<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

// [!doc-source ebook]
const ebook = 'https://snippet.embedpdf.com/ebook.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  theme: { accent: '#7c3aed' },
  disable: ['forms', 'redaction'],
  icons: {
    send: ['M10 14L21 3', 'M21 3l-6.5 18a.5.5 0 0 1-1 0L10 14l-7-3.5a.5.5 0 0 1 0-1L21 3z'],
  },
  commands: [
    {
      id: 'acme:send',
      label: 'Send for signature',
      icon: 'send',
      run: () => alert('Sent for signature'),
    },
  ],
  layout: (layout) => layout.add('acme:send', { to: 'main', section: 'end' }),
};
</script>

<template>
  <PDFViewer :src="ebook" v-bind="config" style="height: 100%" />
</template>
