<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { fontsPlugin } from '@embedpdf/vue/fonts';
import { cloudEngine } from '@cloudpdf/engine';
import FontPreview from './FontPreview.vue';

import '../draw.css';

const engine = cloudEngine();
const plugins = [fontsPlugin()];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <FontPreview />
    </DocumentGate>
  </Viewer>
</template>
