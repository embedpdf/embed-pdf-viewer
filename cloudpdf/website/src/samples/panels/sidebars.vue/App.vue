<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { searchPlugin } from '@embedpdf/vue/search';
import { shellPlugin } from '@embedpdf/vue/shell';
import { cloudEngine } from '@cloudpdf/engine';
import Workspace from './Workspace.vue';

import '../sidebars.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin(), shellPlugin()];

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
