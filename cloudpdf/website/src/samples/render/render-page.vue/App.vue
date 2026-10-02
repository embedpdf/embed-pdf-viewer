<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import PageImages from './PageImages.vue';

import '../render-page.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// No Stage: these pictures are plain images, rendered on demand.
const plugins = [renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <PageImages />
    </DocumentGate>
  </Viewer>
</template>
