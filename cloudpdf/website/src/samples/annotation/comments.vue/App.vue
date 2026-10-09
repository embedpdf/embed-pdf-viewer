<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import AddComments from './AddComments.vue';
import Comments from './Comments.vue';

import '../comments.css';

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
      <AddComments />
      <div class="viewer">
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <AnnotationLayer />
          </template>
        </Stage>
        <Comments />
      </div>
    </DocumentGate>
  </Viewer>
</template>
