<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import InkCursor from './InkCursor.vue';
import Toolbar from './Toolbar.vue';

import '../cursor.css';

const engine = localEngine();
// A standard cursor for the rectangle tool: any CSS cursor name.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({ tools: [{ id: 'square', cursor: 'cell' }] }),
];

// [!doc-source sketch]
const sketch = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-sketch.pdf');
  return { kind: 'bytes', id: 'sketch', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: sketch }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <InkCursor />
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
