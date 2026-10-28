<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { cloudEngine } from '@cloudpdf/engine';
import FormToolbar from './FormToolbar.vue';

import '../basic.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms: OpenInput = { kind: 'share', shareToken: 'shr_eBRW5E3MpolzD8G36Alp30EF' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: forms }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <FormToolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <FormLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
