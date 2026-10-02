<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { SelectionLayer, SelectionMenu, selectionPlugin } from '@embedpdf/vue/selection';
import { localEngine } from '@embedpdf/engine';
import Menu from './Menu.vue';
import OnLoad from './OnLoad.vue';

import '../layers.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const showSearch = ref(true);
const showSelection = ref(true);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <OnLoad />
      <div class="toolbar">
        <label class="option">
          <input v-model="showSearch" type="checkbox" />
          Search matches
        </label>
        <label class="option">
          <input v-model="showSelection" type="checkbox" />
          Text selection
        </label>
      </div>
      <!-- Layers draw inside each page, later ones on top; the overlay floats above them. -->
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SearchLayer v-if="showSearch" />
          <SelectionLayer v-if="showSelection" />
        </template>
        <template #overlay>
          <SelectionMenu v-if="showSelection">
            <Menu />
          </SelectionMenu>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
