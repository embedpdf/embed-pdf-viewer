<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import { PluginRegistry, PluginBatchRegistrations } from '@embedpdf/core';
import { Logger, PdfEngine } from '@embedpdf/models';
import { pdfKey, PDFContextState } from '../context';
import AutoMount from './auto-mount.vue';

export type { PluginBatchRegistrations };

const props = withDefaults(
  defineProps<{
    engine: PdfEngine;
    logger?: Logger;
    plugins: PluginBatchRegistrations;
    onInitialized?: (registry: PluginRegistry) => Promise<void>;
    autoMountDomElements?: boolean;
  }>(),
  {
    autoMountDomElements: true,
  },
);

/* reactive state */
const registry = shallowRef<PluginRegistry | null>(null);
const isInit = ref(true);
const pluginsOk = ref(false);

/* expose to children */
provide<PDFContextState>(pdfKey, { registry, isInitializing: isInit, pluginsReady: pluginsOk });

onMounted(async () => {
  const reg = new PluginRegistry(props.engine, { logger: props.logger });
  reg.registerPluginBatch(props.plugins);
  await reg.initialize();
  await props.onInitialized?.(reg);

  registry.value = reg;
  isInit.value = false;

  reg.pluginsReady().then(() => (pluginsOk.value = true));
});

onBeforeUnmount(() => registry.value?.destroy());
</script>

<template>
  <AutoMount v-if="pluginsOk && autoMountDomElements" :plugins="plugins">
    <!-- scoped slot keeps API parity with React version -->
    <slot :registry="registry" :isInitializing="isInit" :pluginsReady="pluginsOk" />
  </AutoMount>

  <!-- No auto-mount or not ready yet -->
  <slot v-else :registry="registry" :isInitializing="isInit" :pluginsReady="pluginsOk" />
</template>
