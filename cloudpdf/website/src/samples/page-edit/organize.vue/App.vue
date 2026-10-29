<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { renderPlugin } from '@embedpdf/vue/render';
import { pageEditPlugin } from '@embedpdf/vue/page-edit';
import { cloudEngine } from '@cloudpdf/engine';
import PageOrganizer from './PageOrganizer.vue';

import '../organize.css';

const engine = cloudEngine();
const plugins = [renderPlugin(), pageEditPlugin()];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <PageOrganizer />
    </DocumentGate>
  </Viewer>
</template>
