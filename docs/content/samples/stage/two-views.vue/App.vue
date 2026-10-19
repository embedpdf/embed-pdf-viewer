<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import { OverviewToken } from './overview-token';
import Views from './Views.vue';

import '../two-views.css';

const engine = localEngine();

const plugins = [
  stagePlugin(), // the main view
  stagePlugin({
    id: 'stage-overview',
    token: OverviewToken,
    layout: 'grid',
    columns: 'auto',
    zoom: { pageWidth: 72 },
    gap: { px: 10 },
    padding: 10,
    interaction: false, // a drag only scrolls it
    // A wide, short box (a phone) lines the pages up in one row.
    responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
  }),
  renderPlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Views />
    </DocumentGate>
  </Viewer>
</template>
