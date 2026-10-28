<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import SelectShapes from './SelectShapes.vue';
import SelectionToolbar from './SelectionToolbar.vue';

import '../select-code.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source layout]
const layout = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/layout.pdf');
  return { kind: 'bytes', id: 'layout', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: layout }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectShapes />
      <SelectionToolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
