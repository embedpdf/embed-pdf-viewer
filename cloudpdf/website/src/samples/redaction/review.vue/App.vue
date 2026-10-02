<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { searchPlugin } from '@embedpdf/vue/search';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { redactionPlugin } from '@embedpdf/vue/redaction';
import { cloudEngine } from '@cloudpdf/engine';
import MarkSome from './MarkSome.vue';
import PendingMarks from './PendingMarks.vue';

import '../review.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  searchPlugin(),
  annotationPlugin(),
  redactionPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <MarkSome />
      <div class="viewer">
        <Stage class="stage">
          <template #page>
            <RenderLayer :annotations="false" />
            <AnnotationLayer />
          </template>
        </Stage>
        <PendingMarks />
      </div>
    </DocumentGate>
  </Viewer>
</template>
