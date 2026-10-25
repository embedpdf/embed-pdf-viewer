<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { fontsPlugin } from '@embedpdf/vue/fonts';
import { cloudEngine } from '@cloudpdf/engine';
import FontPreview from './FontPreview.vue';

import '../draw.css';

const engine = cloudEngine();
const plugins = [fontsPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <FontPreview />
    </DocumentGate>
  </Viewer>
</template>
