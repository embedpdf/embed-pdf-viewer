<script setup lang="ts">
import { PDFViewer, Panel, type Layout } from '@embedpdf/viewer-vue';
import Notes from './Notes.vue'; // your app

const layout = (layout: Layout) =>
  layout
    .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
    .add('panel:notes', { to: 'main', section: 'end' });
</script>

<template>
  <PDFViewer src="/report.pdf" :layout="layout" style="height: 100vh">
    <Panel id="notes">
      <Notes />
    </Panel>
  </PDFViewer>
</template>
