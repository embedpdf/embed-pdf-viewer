<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import AddAnnotations from './AddAnnotations.vue';
import CopyButton from './CopyButton.vue';

import '../copy.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AddAnnotations />
      <CopyButton />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
