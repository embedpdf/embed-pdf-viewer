<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import Thumbnails from './Thumbnails.vue';
import { ThumbsToken } from './thumbs-token';

import '../thumbnail-strip.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

const plugins = [
  stagePlugin(), // the main view
  stagePlugin({
    id: 'stage-thumbs',
    token: ThumbsToken,
    interaction: false, // a drag doesn't select text or draw
    zoomGestures: false, // a pinch doesn't resize the thumbnails
    zoom: { pageWidth: 96 },
    gap: { px: 12 },
    padding: 10,
    pageFrame: { bottom: 20 }, // room for the page number
    // A wide, short strip (on a phone) lines the thumbnails up in a row.
    responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
  }),
  renderPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="reader">
        <Thumbnails />
        <Stage class="stage">
          <template #page><RenderLayer /></template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
