<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { stampPlugin } from '@embedpdf/vue/stamp';
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';
import MakeStamp from './MakeStamp.vue';
import SelectSeal from './SelectSeal.vue';

import '../from-selection.css';

const engine = cloudEngine();
const assetEngine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

const approvals: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: approvals }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectSeal />
      <MakeStamp />
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
