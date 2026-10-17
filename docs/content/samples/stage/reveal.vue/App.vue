<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput, PageContextValue } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import type { RevealZoom } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import SpotPicker from './SpotPicker.vue';
import { SPOTS } from './spots';

import '../reveal.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const active = ref(0);
const zoom = ref<RevealZoom>('fit-width');

// Page coordinates become pixels only here, as the spot is drawn.
function boxOn(page: PageContextValue, rect: (typeof SPOTS)[number]['rect']) {
  const box = page.transform.pageToViewRect(rect);
  return { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` };
}
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SpotPicker v-model:active="active" v-model:zoom="zoom" />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
        <template #page-chrome="{ page }">
          <template v-for="(spot, index) in SPOTS" :key="spot.label">
            <div
              v-if="spot.page === page.pageIndex"
              class="spot"
              :data-active="index === active"
              :style="boxOn(page, spot.rect)"
            />
          </template>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
