<script setup lang="ts">
import { computed, ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import Toolbar from './Toolbar.vue';

import '../ghost.css';

const engine = localEngine();
// A preview for the rectangle (off by default for tools you drag), and a fainter one for notes.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({
    tools: [
      { id: 'square', ghost: true },
      { id: 'note', ghost: { opacity: 0.3 } },
    ],
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// `--epdf-ghost-opacity` from CSS wins over each tool's own opacity, for every tool.
const opacity = ref<number | null>(null);
const ghostOpacity = computed(() =>
  opacity.value === null ? undefined : { '--epdf-ghost-opacity': opacity.value },
);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar v-model:opacity="opacity" />
      <Stage class="stage" :style="ghostOpacity">
        <template #page>
          <RenderLayer :annotations="false" />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
