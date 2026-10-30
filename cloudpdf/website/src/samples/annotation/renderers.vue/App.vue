<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import type { AnnotationRenderer } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import CommentBubble from './CommentBubble.vue';
import TurnButton from './TurnButton.vue';

import '../renderers.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const proposal: OpenInput = { kind: 'grant', grant: 'shr_qnqHtCNRpzz-s7DPFBIbuOAF' };

// Defined once, here: the layer registers each entry.
const RENDERERS: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
];
const NONE: AnnotationRenderer[] = [];

const mine = ref(true);
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
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Look">
          <button type="button" :aria-pressed="mine" @click="mine = true">Your look</button>
          <button type="button" :aria-pressed="!mine" @click="mine = false">The PDF's look</button>
        </div>
        <TurnButton />
      </div>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
          <AnnotationLayer :renderers="mine ? RENDERERS : NONE" />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
