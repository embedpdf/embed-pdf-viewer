<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import PageCard from './PageCard.vue';

import '../basic.css';

const engine = cloudEngine();
// No Stage: a page on its own needs only the render plugin.
const plugins = [renderPlugin()];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <PageCard />
    </DocumentGate>
  </Viewer>
</template>
