<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Scrollbar, Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import ReadingProgress from './ReadingProgress.vue';

import '../scrollbar.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ReadingProgress />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
        <template #overlay>
          <Scrollbar axis="y" :auto-hide="1200" class="scrollbar" thumb-class="thumb" />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
