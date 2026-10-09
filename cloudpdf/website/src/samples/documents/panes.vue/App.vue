<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { viewManagerPlugin } from '@embedpdf/vue/view-manager';
import { cloudEngine } from '@cloudpdf/engine';
import Panes from './Panes.vue';

import '../panes.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), viewManagerPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[
      { source: ebook, name: 'Contract' },
      { source: ebook, name: 'Report' },
    ]"
  >
    <Panes />
  </Viewer>
</template>
