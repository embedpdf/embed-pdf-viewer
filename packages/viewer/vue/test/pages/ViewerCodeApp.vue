<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue';
import { PDFViewer } from '@embedpdf/viewer-vue';
import type { Viewer } from '@embedpdf/viewer-vue';

import InsideViewer from './InsideViewer.vue';
import OutsideViewer from './OutsideViewer.vue';
import type { ViewerCodeRecord } from './viewer-code';

const { record } = defineProps<{ record: ViewerCodeRecord }>();

/** A plugin of the app's own, as a headless app writes one. */
const analyticsPlugin = (config: { endpoint: string }) => ({
  id: 'acme-analytics',
  token: { name: 'analytics' },
  create: () => ({
    api: { track: (name: string) => record.tracked.push(`${config.endpoint} ${name}`) },
  }),
});

const plugins = {
  stage: { spread: 'odd' as const },
  analytics: analyticsPlugin({ endpoint: '/api/events' }),
};

let mounts = 0;
const countMount = () => ++mounts;

const shown = shallowRef(true);
const pdf = useTemplateRef('pdf');
record.element = () => pdf.value?.elementRef ?? null;
record.show = (next) => (shown.value = next);

function onReady(viewer: Viewer) {
  const index = record.viewers.push(viewer) - 1;
  viewer.documents.onClosed(({ documentId }) => record.heard.push(`${index} closed ${documentId}`));
}
</script>

<template>
  <OutsideViewer :record="record" />
  <PDFViewer
    v-if="shown"
    ref="pdf"
    src="/sample.pdf"
    :plugins="plugins"
    class="report-viewer"
    style="height: 100vh; display: block"
    @ready="onReady"
  >
    <InsideViewer :record="record" :count-mount="countMount" />
  </PDFViewer>
</template>
