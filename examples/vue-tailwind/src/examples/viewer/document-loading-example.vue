<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type DocumentManagerPlugin,
  type DocumentManagerCapability,
} from '@embedpdf/vue-pdf-viewer';
import { FileUp, Globe, Layers } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const docManager = ref<DocumentManagerCapability | null>(null);
const activeDocId = ref<string | null>(null);
const docList = ref<{ id: string; name: string }[]>([]);
const cleanups: (() => void)[] = [];

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

const handleReady = (registry: PluginRegistry) => {
  const dm = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
  if (!dm) return;

  docManager.value = dm;

  const updateList = () => {
    const docs = dm.getOpenDocuments();
    docList.value = docs.map((d) => ({ id: d.id, name: d.name || 'Untitled' }));
    activeDocId.value = dm.getActiveDocumentId();
  };

  cleanups.push(dm.onDocumentOpened(updateList));
  cleanups.push(dm.onDocumentClosed(updateList));
  cleanups.push(
    dm.onActiveDocumentChanged((e) => {
      activeDocId.value = e.currentDocumentId;
    }),
  );

  updateList();
};

onUnmounted(() => {
  cleanups.forEach((cleanup) => cleanup());
});

const handleUrlLoad = () => {
  docManager.value?.openDocumentUrl({
    url: 'https://snippet.embedpdf.com/ebook.pdf',
    documentId: 'ebook-demo',
  });
};

const handleFileUpload = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();

  docManager.value?.openDocumentBuffer({
    buffer,
    name: file.name,
    autoActivate: true,
  });

  target.value = '';
};

const handleSwitch = (event: Event) => {
  const id = (event.target as HTMLSelectElement).value;
  docManager.value?.setActiveDocument(id);
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Control Panel -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <!-- Load Actions -->
      <div class="flex gap-2">
        <button
          type="button"
          @click="handleUrlLoad"
          class="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          <Globe :size="16" /> Load URL
        </button>

        <label
          class="flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          <FileUp :size="16" /> Upload Local
          <input type="file" class="hidden" accept=".pdf" @change="handleFileUpload" />
        </label>
      </div>

      <!-- Document Switcher -->
      <div class="flex items-center gap-2">
        <Layers :size="16" class="text-gray-500" />
        <select
          :value="activeDocId || ''"
          @change="handleSwitch"
          class="rounded-md border-gray-300 bg-white py-1.5 text-sm dark:bg-gray-700"
          :disabled="docList.length === 0"
        >
          <option value="" disabled>Select Document...</option>
          <option v-for="doc in docList" :key="doc.id" :value="doc.id">{{ doc.name }}</option>
        </select>
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
          tabBar: 'always',
          documentManager: {
            maxDocuments: 5,
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
