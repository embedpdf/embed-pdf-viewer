<script setup lang="ts">
import { PDFViewer, ToolbarItem } from '@embedpdf/viewer-vue';
import type { Layout, Viewer, ViewerConfig } from '@embedpdf/viewer-vue';

import DocumentStatus from './DocumentStatus.vue';
import type { QuickStartRecord } from './quick-start';

const { record } = defineProps<{ record: QuickStartRecord }>();

/** Quick start's `viewer-config.js`, its command saying it ran in place of the request. */
const config = {
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
      run: ({ documentId }) => {
        record.sent.push(documentId);
      },
    },
  ],
  layout: (layout: Layout) => layout.add('acme:send', { to: 'main', section: 'end' }),
} satisfies ViewerConfig;

/** Step 4: room for your component, after the config's own layout. */
const layout = (base: Layout) =>
  config.layout(base).add({ custom: 'status' }, { to: 'main', section: 'end' });

function onReady(viewer: Viewer) {
  record.viewer = viewer;
}
</script>

<template>
  <button data-check="before">Before the viewer</button>
  <PDFViewer
    src="/sample.pdf"
    v-bind="config"
    :layout="layout"
    :style="{ height: '100vh', display: 'block' }"
    @ready="onReady"
  >
    <ToolbarItem id="status">
      <DocumentStatus />
    </ToolbarItem>
  </PDFViewer>
</template>
