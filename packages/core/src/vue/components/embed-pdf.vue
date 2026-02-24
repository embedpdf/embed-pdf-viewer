<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, shallowRef, computed } from 'vue';
import {
  PluginRegistry,
  PluginBatchRegistrations,
  PluginRegistryConfig,
  CoreState,
  DocumentState,
} from '@embedpdf/core';
import { Logger, PdfEngine } from '@embedpdf/models';
import { pdfKey, PDFContextState } from '../context';
import AutoMount from './auto-mount.vue';

export type { PluginBatchRegistrations };

const props = withDefaults(
  defineProps<{
    engine: PdfEngine;
    /** Registry configuration including logger, permissions, and defaults. */
    config?: PluginRegistryConfig;
    /** @deprecated Use config.logger instead. Will be removed in next major version. */
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
const coreState = ref<CoreState | null>(null);
const isInit = ref(true);
const pluginsOk = ref(false);

// Compute convenience accessors
const activeDocumentId = computed(() => coreState.value?.activeDocumentId ?? null);
const documents = computed(() => coreState.value?.documents ?? {});
const documentOrder = computed(() => coreState.value?.documentOrder ?? []);

const activeDocument = computed(() => {
  const docId = activeDocumentId.value;
  const docs = documents.value;
  return docId && docs[docId] ? docs[docId] : null;
});

const documentStates = computed(() => {
  const docs = documents.value;
  const order = documentOrder.value;
  return order
    .map((docId) => docs[docId])
    .filter((doc): doc is DocumentState => doc !== null && doc !== undefined);
});

/* expose to children */
provide<PDFContextState>(pdfKey, {
  registry,
  coreState,
  isInitializing: isInit,
  pluginsReady: pluginsOk,
  activeDocumentId,
  activeDocument,
  documents,
  documentStates,
});

onMounted(async () => {
  // Merge deprecated logger prop into config (config.logger takes precedence)
  const finalConfig: PluginRegistryConfig = {
    ...props.config,
    logger: props.config?.logger ?? props.logger,
  };
  const reg = new PluginRegistry(props.engine, finalConfig);
  reg.registerPluginBatch(props.plugins);
  await reg.initialize();

  if (reg.isDestroyed()) {
    return;
  }

  const store = reg.getStore();
  coreState.value = store.getState().core;

  const unsubscribe = store.subscribe((action, newState, oldState) => {
    // Only update if it's a core action and the core state changed
    if (store.isCoreAction(action) && newState.core !== oldState.core) {
      coreState.value = newState.core;
    }
  });

  await props.onInitialized?.(reg);

  if (reg.isDestroyed()) {
    unsubscribe();
    return;
  }

  registry.value = reg;
  isInit.value = false;

  reg.pluginsReady().then(() => {
    if (!reg.isDestroyed()) {
      pluginsOk.value = true;
    }
  });

  onBeforeUnmount(() => {
    unsubscribe();
    registry.value?.destroy();
  });
});
</script>

<template>
  <AutoMount v-if="pluginsOk && autoMountDomElements" :plugins="plugins">
    <!-- scoped slot keeps API parity with React version -->
    <slot
      :registry="registry"
      :coreState="coreState"
      :isInitializing="isInit"
      :pluginsReady="pluginsOk"
      :activeDocumentId="activeDocumentId"
      :activeDocument="activeDocument"
      :documents="documents"
      :documentStates="documentStates"
    />
  </AutoMount>

  <!-- No auto-mount or not ready yet -->
  <slot
    v-else
    :registry="registry"
    :coreState="coreState"
    :isInitializing="isInit"
    :pluginsReady="pluginsOk"
    :activeDocumentId="activeDocumentId"
    :activeDocument="activeDocument"
    :documents="documents"
    :documentStates="documentStates"
  />
</template>
