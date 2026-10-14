<script setup lang="ts">
import { PDFViewer, ToolbarItem } from '@embedpdf/viewer-vue';
import type { LayoutFunction, Viewer } from '@embedpdf/viewer-vue';

import AppSearch from './AppSearch.vue';
import type { HooksRecord } from './hooks';

const { record } = defineProps<{ record: HooksRecord }>();

const layout: LayoutFunction = (base) =>
  base.add(
    { custom: 'app-search', command: 'panel:search', importance: 5 },
    { to: 'main', section: 'start', group: 'app' },
  );

function onReady(viewer: Viewer) {
  record.viewer = viewer;
}
</script>

<template>
  <PDFViewer
    src="/sample.pdf"
    :layout="layout"
    style="height: 100vh; display: block"
    @ready="onReady"
  >
    <ToolbarItem id="app-search">
      <AppSearch />
    </ToolbarItem>
  </PDFViewer>
</template>
