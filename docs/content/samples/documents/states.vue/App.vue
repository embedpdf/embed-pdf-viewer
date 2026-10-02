<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import OpenError from './OpenError.vue';
import PasswordForm from './PasswordForm.vue';
import Tabs from './Tabs.vue';

import '../states.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A file that isn't a PDF, so its document can't be opened.
const broken: OpenInput = { kind: 'bytes', bytes: new TextEncoder().encode('Not a PDF') };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[
      { source: ebook, name: 'ebook.pdf' },
      { source: broken, name: 'broken.pdf', active: true },
    ]"
  >
    <Tabs />
    <DocumentGate>
      <template #fallback><div class="panel">Opening…</div></template>
      <template #locked="{ document }"><PasswordForm :document="document" /></template>
      <template #error="{ document }"><OpenError :document="document" /></template>
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
