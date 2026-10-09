<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import Toolbar from './Toolbar.vue';

import '../click-create.css';

const engine = localEngine();
// What one click makes: a 120 × 80 rectangle, an arrow pointing down at the click, and no circle.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({
    tools: [
      { id: 'square', clickCreate: { width: 120, height: 80 } },
      {
        id: 'arrow',
        extends: 'line',
        defaults: { lineEndings: { start: 'none', end: 'closed-arrow' } },
        clickCreate: { length: 80, rotation: 90, anchor: 'end' },
      },
      { id: 'circle', clickCreate: false }, // drag only
    ],
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
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
