<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import AnnotationKeys from './AnnotationKeys.vue';
import DraftMenu from './DraftMenu.vue';
import Toolbar from './Toolbar.vue';

import '../polygon.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AnnotationKeys />
      <Toolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
        </template>
        <template #overlay><DraftMenu /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
