<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { localEngine } from '@embedpdf/engine';
import ColorPicker from './ColorPicker.vue';

import '../highlight-colors.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  searchPlugin({ highlight: { color: '#ffd500', activeColor: '#ff9632' } }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const fromCss = ref(false);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="toolbar">
        <ColorPicker />
        <label class="option">
          <input v-model="fromCss" type="checkbox" />
          Override with CSS
        </label>
      </div>
      <Stage :class="fromCss ? 'stage from-css' : 'stage'">
        <template #page>
          <RenderLayer />
          <SearchLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
