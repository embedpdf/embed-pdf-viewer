<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { renderPlugin } from '@embedpdf/vue/render';
import { pageEditPlugin } from '@embedpdf/vue/page-edit';
import { localEngine } from '@embedpdf/engine';
import PageOrder from './PageOrder.vue';

import '../reorder.css';

const engine = localEngine();
const plugins = [renderPlugin(), pageEditPlugin()];

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
      <PageOrder />
    </DocumentGate>
  </Viewer>
</template>
