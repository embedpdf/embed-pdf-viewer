<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import TabTools from './TabTools.vue';
import Tabs from './Tabs.vue';

import '../tabs.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin()];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const article: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const sketch: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[
      { source: welcome, name: 'Guide' },
      { source: article, name: 'Article' },
    ]"
  >
    <Tabs :sketch="sketch" />
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <TabTools />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
