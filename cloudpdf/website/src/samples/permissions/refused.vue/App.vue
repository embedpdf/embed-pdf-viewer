<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import DownloadAnyway from './DownloadAnyway.vue';

import '../refused.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin()];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

// Read and select, but no downloading.
const scope = ['doc.open', 'doc.render', 'doc.text.select'];
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :scope="scope"
    :initial-documents="[{ source: welcome }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <DownloadAnyway />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
