<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type RotatePlugin,
  type RotateScope,
} from '@embedpdf/vue-pdf-viewer';
import { RotateCw, RotateCcw } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const rotate = ref<RotateScope | null>(null);
const currentRotation = ref(0);
const cleanups: (() => void)[] = [];

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const rotatePlugin = registry.getPlugin<RotatePlugin>('rotate')?.provides();
  const docRotate = rotatePlugin?.forDocument('ebook');

  if (docRotate) {
    rotate.value = docRotate;
    currentRotation.value = docRotate.getRotation();

    const cleanup = docRotate.onRotateChange((rotation) => {
      currentRotation.value = rotation;
    });
    cleanups.push(cleanup);
  }
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

onUnmounted(() => {
  cleanups.forEach((cleanup) => cleanup());
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="rotate?.rotateBackward()"
            class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
            title="Rotate Counter-Clockwise"
          >
            <RotateCcw :size="20" />
          </button>
          <button
            type="button"
            @click="rotate?.rotateForward()"
            class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
            title="Rotate Clockwise"
          >
            <RotateCw :size="20" />
          </button>
        </div>
        <span class="font-mono text-sm font-medium text-gray-600 dark:text-gray-300">
          Rotation: {{ currentRotation * 90 }}°
        </span>
      </div>
    </div>

    <!-- Viewer -->
    <div
      class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
    >
      <PDFViewer
        @init="handleInit"
        @ready="handleReady"
        :config="{
          theme: { preference: themePreference },
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'ebook',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
