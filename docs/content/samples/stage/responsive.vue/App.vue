<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import Toolbar from './Toolbar.vue';

import '../responsive.css';

const engine = localEngine();

// Facing pages with a roomy margin, and one rule for a narrow Stage: a thin
// margin and one page at a time. The rule has a name, so the UI can read it too.
const plugins = [
  stagePlugin({
    padding: 24,
    spread: 'odd',
    responsive: [
      { name: 'compact', when: { maxWidth: 600 }, settings: { padding: 4, spread: 'none' } },
    ],
  }),
  renderPlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const narrow = ref(false);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar v-model:narrow="narrow" />
      <div class="frame" :data-width="narrow ? 'narrow' : 'full'">
        <Stage class="stage">
          <template #page><RenderLayer /></template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
