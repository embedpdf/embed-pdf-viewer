<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import Comments from './Comments.vue';

import '../comments.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const proposal = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/proposal.pdf');
  return { kind: 'bytes', id: 'proposal', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :identity="{ userId: 'u_381', displayName: 'Dana Smith' }"
    :initial-documents="[{ source: proposal }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="viewer">
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <SelectionLayer />
            <AnnotationLayer />
          </template>
        </Stage>
        <Comments />
      </div>
    </DocumentGate>
  </Viewer>
</template>
