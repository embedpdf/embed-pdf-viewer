<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { metadataPlugin } from '@embedpdf/vue/metadata';
import { cloudEngine } from '@cloudpdf/engine';
import Properties from './Properties.vue';

import '../properties.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [metadataPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Properties />
    </DocumentGate>
  </Viewer>
</template>
