<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { shellPlugin } from '@embedpdf/vue/shell';
import { cloudEngine } from '@cloudpdf/engine';
import Workspace from './Workspace.vue';

import '../remember.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), shellPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Workspace />
    </DocumentGate>
  </Viewer>
</template>
