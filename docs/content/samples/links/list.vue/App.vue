<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { annotationPlugin } from '@embedpdf/vue/annotation';
import { LinkLayer, linkPlugin } from '@embedpdf/vue/link';
import { localEngine } from '@embedpdf/engine';
import AddLinks from './AddLinks.vue';
import LinkList from './LinkList.vue';

import '../list.css';

const engine = localEngine();
// The annotation plugin is only here to make the links below.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  linkPlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The list reads the links once they're made.
const ready = ref(false);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AddLinks @added="ready = true" />
      <div class="layout">
        <LinkList :ready="ready" />
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <LinkLayer />
          </template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
