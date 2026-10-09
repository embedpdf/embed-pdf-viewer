<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import Toolbar from './Toolbar.vue';

import '../custom-tools.css';

const engine = localEngine();
// A blue pen, an arrow, and three tools of your own. `meta` is yours: the toolbar reads its label.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({
    tools: [
      { id: 'ink', defaults: { color: '#1e90ff', strokeWidth: 3 }, meta: { label: 'Blue pen' } },
      {
        id: 'arrow',
        extends: 'line',
        defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
        meta: { label: 'Arrow' },
      },
      {
        id: 'red-pen',
        extends: 'ink',
        defaults: { color: '#ff0000', strokeWidth: 2 },
        meta: { label: 'Red pen' },
      },
      {
        id: 'marker',
        extends: 'ink-highlight',
        defaults: { color: '#ffa500' },
        meta: { label: 'Marker' },
      },
      {
        id: 'todo',
        extends: 'note',
        defaults: { icon: 'key', contents: 'TODO' },
        meta: { label: 'To do' },
      },
    ],
  }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
