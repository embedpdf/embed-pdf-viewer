<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { commandsPlugin, standardCommands } from '@embedpdf/vue/commands';
import { localEngine } from '@embedpdf/engine';
import MainToolbar from './MainToolbar.vue';

import '../basic.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
  commandsPlugin({ commands: standardCommands }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Narrow the toolbar to watch it make room: labels go first, then the tools fold, then "More".
const width = ref(100);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <label class="width">
        Toolbar width
        <input v-model.number="width" type="range" min="30" max="100" />
        <output>{{ width }}%</output>
      </label>
      <div class="frame" :style="{ width: `${width}%` }">
        <MainToolbar />
      </div>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
