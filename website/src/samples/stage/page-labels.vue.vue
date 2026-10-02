<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';

import './page-labels.css';

const engine = localEngine();

// Reserve a 26px band below every page: the label lives there, so it never
// covers the page and keeps its size when you zoom.
const plugins = [stagePlugin({ pageFrame: { bottom: 26 } }), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Stage class="stage">
        <template #page><RenderLayer /></template>
        <template #page-chrome="{ page }">
          <div class="page-label" :style="{ height: `${page.frame.bottom}px` }">
            Page {{ page.pageIndex + 1 }}
          </div>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
