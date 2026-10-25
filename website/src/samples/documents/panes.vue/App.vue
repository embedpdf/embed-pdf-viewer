<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { viewManagerPlugin } from '@embedpdf/vue/view-manager';
import { localEngine } from '@embedpdf/engine';
import Panes from './Panes.vue';

import '../panes.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), viewManagerPlugin()];

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-welcome.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const article = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-article.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
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
    <Panes />
  </Viewer>
</template>
