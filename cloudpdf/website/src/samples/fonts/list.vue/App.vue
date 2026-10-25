<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { annotationPlugin } from '@embedpdf/vue/annotation';
import { fontsPlugin } from '@embedpdf/vue/fonts';
import { cloudEngine } from '@cloudpdf/engine';
import Fonts from './Fonts.vue';

import '../list.css';

const engine = cloudEngine();
const plugins = [interactionPlugin(), annotationPlugin(), fontsPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Fonts />
    </DocumentGate>
  </Viewer>
</template>
