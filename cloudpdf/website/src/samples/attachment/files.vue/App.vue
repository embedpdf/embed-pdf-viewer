<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { attachmentPlugin } from '@embedpdf/vue/attachment';
import { cloudEngine } from '@cloudpdf/engine';
import Files from './Files.vue';

import '../files.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), attachmentPlugin()];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="layout">
        <Files />
        <Stage class="stage">
          <template #page><RenderLayer /></template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
