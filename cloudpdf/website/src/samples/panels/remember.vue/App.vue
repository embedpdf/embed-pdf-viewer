<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { shellPlugin } from '@embedpdf/vue/shell';
import { cloudEngine } from '@cloudpdf/engine';
import Workspace from './Workspace.vue';

import '../remember.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), shellPlugin()];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Workspace />
    </DocumentGate>
  </Viewer>
</template>
