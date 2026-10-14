<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { localEngine } from '@embedpdf/engine';
import ShowColors from './ShowColors.vue';

import '../dark-mode.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Your app's own switch: the colors are in the stylesheet, under [data-theme='dark'].
const theme = ref<'light' | 'dark'>('dark');
</script>

<template>
  <div class="pdf-viewer" :data-theme="theme">
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Theme">
        <button type="button" :aria-pressed="theme === 'light'" @click="theme = 'light'">
          Light
        </button>
        <button type="button" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">
          Dark
        </button>
      </div>
    </div>
    <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
      <DocumentGate>
        <template #fallback><p class="loading">Loading…</p></template>
        <ShowColors />
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <SearchLayer />
            <SelectionLayer />
          </template>
        </Stage>
      </DocumentGate>
    </Viewer>
  </div>
</template>
