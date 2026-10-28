<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { outlinePlugin } from '@embedpdf/vue/outline';
import { cloudEngine } from '@cloudpdf/engine';
import OutlineEditor from './OutlineEditor.vue';

import '../nesting.css';

const engine = cloudEngine();
const plugins = [outlinePlugin()];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <OutlineEditor />
    </DocumentGate>
  </Viewer>
</template>
