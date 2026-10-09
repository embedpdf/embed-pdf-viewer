<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { cloudEngine } from '@cloudpdf/engine';
import ShowColors from './ShowColors.vue';

import '../dark-mode.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
