<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { fontsPlugin } from '@embedpdf/vue/fonts';
import { localEngine } from '@embedpdf/engine';
import FontPreview from './FontPreview.vue';

import '../draw.css';

const engine = localEngine();
const plugins = [fontsPlugin()];

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <FontPreview />
    </DocumentGate>
  </Viewer>
</template>
