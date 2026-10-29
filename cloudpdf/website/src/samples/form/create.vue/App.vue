<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { cloudEngine } from '@cloudpdf/engine';
import BuildToolbar from './BuildToolbar.vue';

import '../create.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const registration: OpenInput = { kind: 'grant', grant: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: registration }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <BuildToolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <FormLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
