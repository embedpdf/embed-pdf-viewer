<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import { roles, type Role } from './roles';
import Toolbar from './Toolbar.vue';

import '../identity.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const dana = { userId: 'u_381', displayName: 'Dana Smith' };
const role = ref<Role>('reader');
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :identity="dana"
    :scope="roles[role]"
    :initial-documents="[{ source: ebook, name: 'ebook.pdf' }]"
  >
    <Toolbar v-model:role="role" :ebook="ebook" />
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
