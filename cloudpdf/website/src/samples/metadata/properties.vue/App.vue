<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { metadataPlugin } from '@embedpdf/vue/metadata';
import { cloudEngine } from '@cloudpdf/engine';
import Properties from './Properties.vue';

import '../properties.css';

const engine = cloudEngine();
const plugins = [metadataPlugin()];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Properties />
    </DocumentGate>
  </Viewer>
</template>
