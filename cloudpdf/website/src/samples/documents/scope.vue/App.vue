<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import SideBySide from './SideBySide.vue';

import '../scope.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin()];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[
      { source: welcome, name: 'Original' },
      { source: welcome, name: 'Revised' },
    ]"
  >
    <SideBySide />
  </Viewer>
</template>
