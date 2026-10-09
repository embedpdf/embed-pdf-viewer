<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import AddAnnotations from './AddAnnotations.vue';
import HoverCard from './HoverCard.vue';

import '../hover-card.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :identity="{ userId: 'u_381', displayName: 'Dana Smith' }"
    :initial-documents="[{ source: ebook }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AddAnnotations />
      <p class="hint">Point at a note or the green rectangle</p>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
        </template>
        <template #overlay><HoverCard /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
