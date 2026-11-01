<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import Authors from './Authors.vue';
import Toolbar from './Toolbar.vue';

import '../identity.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const sketch: OpenInput = { kind: 'grant', grant: 'shr_IyOgSdO4AmJqV4BoMv5V0nYU' };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :identity="{ userId: 'u_381', displayName: 'Dana Smith' }"
    :initial-documents="[{ source: sketch }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar />
      <div class="viewer">
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <AnnotationLayer />
          </template>
        </Stage>
        <Authors />
      </div>
    </DocumentGate>
  </Viewer>
</template>
