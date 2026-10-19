<!-- 2.x:

<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, type CommandsPlugin, type PDFViewerExpose } from '@embedpdf/vue-pdf-viewer';

const viewer = ref<PDFViewerExpose | null>(null);

async function print() {
  const registry = await viewer.value?.registry;
  registry?.getPlugin<CommandsPlugin>('commands')?.provides().execute('document:print');
}
</script>

<template>
  <button @click="print">Print</button>
  <PDFViewer ref="viewer" :config="{ src: { shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' } }" :style="{ height: '80vh' }" />
</template>
-->

<script setup lang="ts">
import { shallowRef } from 'vue';
import { PDFViewer, type Viewer } from '@cloudpdf/viewer-vue';

const viewer = shallowRef<Viewer | null>(null);
</script>

<template>
  <button :disabled="!viewer" @click="viewer?.commands.execute('document:print')">Print</button>
  <PDFViewer :src="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" style="height: 80vh" @ready="viewer = $event" />
</template>
