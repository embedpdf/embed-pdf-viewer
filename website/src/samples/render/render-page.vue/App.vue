<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import PageImages from './PageImages.vue';

import '../render-page.css';

const engine = localEngine();
// No Stage: these pictures are plain images, rendered on demand.
const plugins = [renderPlugin()];

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <PageImages />
    </DocumentGate>
  </Viewer>
</template>
