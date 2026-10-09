<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { searchPlugin } from '@embedpdf/vue/search';
import { localEngine } from '@embedpdf/engine';
import ActiveMatch from './ActiveMatch.vue';
import Pages from './Pages.vue';

import '../click-match.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ActiveMatch />
      <Pages />
    </DocumentGate>
  </Viewer>
</template>
