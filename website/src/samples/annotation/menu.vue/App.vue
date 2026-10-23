<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, AnnotationMenu, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import SelectTextBox from './SelectTextBox.vue';
import SelectionActions from './SelectionActions.vue';

import '../menu.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const notice = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-notice.pdf');
  return { kind: 'bytes', id: 'notice', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: notice }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectTextBox />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
          <AnnotationLayer />
        </template>
        <template #overlay>
          <AnnotationMenu placement="bottom">
            <SelectionActions />
          </AnnotationMenu>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
