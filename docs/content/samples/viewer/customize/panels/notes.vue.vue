<script setup lang="ts">
import { PDFViewer, Panel, type ViewerConfig } from '@embedpdf/viewer-vue';
import './notes.css';

// [!doc-source welcome]
const welcome = '/pdfs/welcome.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  layout: (layout) =>
    layout
      .addPanel('notes', {
        side: 'end',
        title: 'Notes',
        icon: 'book',
        present: { medium: 'dock' },
        width: { initial: 320, min: 240, max: 480 },
      })
      .add('panel:notes', { to: 'main', section: 'end' }),
};
</script>

<template>
  <PDFViewer :src="welcome" v-bind="config" style="height: 100%">
    <Panel id="notes">
      <textarea class="notes" placeholder="Your notes"></textarea>
    </Panel>
  </PDFViewer>
</template>
