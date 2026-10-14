<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import PageCard from './PageCard.vue';

import '../basic.css';

const engine = localEngine();
// No Stage: a page on its own needs only the render plugin.
const plugins = [renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <PageCard />
    </DocumentGate>
  </Viewer>
</template>
