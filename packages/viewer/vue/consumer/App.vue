<script setup lang="ts">
// The publish check's app (`tooling/build/src/check-framework-package.mjs`): the documented
// setup, type-checked against the packed package as a user installs it.
import { PDFViewer, ToolbarItem, type Layout, type Viewer } from '@embedpdf/viewer-vue';
import Status from './Status.vue';

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
const onReady = (viewer: Viewer) => viewer.commands.execute('zoom:in');
</script>

<template>
  <PDFViewer
    src="/report.pdf"
    :layout="layout"
    theme="system"
    :disable="['forms']"
    style="height: 100vh"
    @ready="onReady"
    @panel-resize="({ id, width }) => console.log(id, width)"
  >
    <ToolbarItem id="status"><Status /></ToolbarItem>
  </PDFViewer>
</template>
