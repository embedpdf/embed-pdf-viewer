<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import HoverCard from './HoverCard.vue';

import '../hover-card.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const proposal: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
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
      <p class="hint">Point at a note or a marked sentence</p>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
          <AnnotationLayer />
        </template>
        <template #overlay><HoverCard /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
