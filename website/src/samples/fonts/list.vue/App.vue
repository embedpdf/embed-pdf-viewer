<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { annotationPlugin } from '@embedpdf/vue/annotation';
import { fontsPlugin } from '@embedpdf/vue/fonts';
import { localEngine } from '@embedpdf/engine';
import Fonts from './Fonts.vue';

import '../list.css';

const engine = localEngine();
const plugins = [interactionPlugin(), annotationPlugin(), fontsPlugin()];

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Fonts />
    </DocumentGate>
  </Viewer>
</template>
