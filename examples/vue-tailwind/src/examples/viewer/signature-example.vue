<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type SignaturePlugin,
  type SignatureCapability,
  serializeEntries,
  deserializeEntries,
} from '@embedpdf/vue-pdf-viewer';
import { Save, Upload, Trash2, HardDrive } from 'lucide-vue-next';

const STORAGE_KEY = 'embedpdf-signatures';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const signatureApi = ref<SignatureCapability | null>(null);
const entryCount = ref(0);
const autoSave = ref(true);
const status = ref<string | null>(null);
const storedCount = ref(
  (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as unknown[]).length : 0;
    } catch {
      return 0;
    }
  })(),
);
const cleanups: (() => void)[] = [];
let autoSaveCleanup: (() => void) | undefined;

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const api = registry.getPlugin<SignaturePlugin>('signature')?.provides();
  if (!api) return;

  signatureApi.value = api;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const entries = deserializeEntries(JSON.parse(raw));
      api.loadEntries(entries);
      status.value = `Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''} from storage`;
    } catch {
      status.value = 'Failed to load saved signatures';
    }
  }

  entryCount.value = api.getEntries().length;

  const cleanupEntries = api.onEntriesChange((entries) => {
    entryCount.value = entries.length;
  });
  cleanups.push(cleanupEntries);

  setupAutoSave();
};

const setupAutoSave = () => {
  autoSaveCleanup?.();
  autoSaveCleanup = undefined;

  if (!signatureApi.value || !autoSave.value) return;

  autoSaveCleanup = signatureApi.value.onEntriesChange((entries) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(entries)));
    storedCount.value = entries.length;
    status.value = `Auto-saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`;
  });
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

watch(autoSave, () => {
  setupAutoSave();
});

onUnmounted(() => {
  autoSaveCleanup?.();
  cleanups.forEach((cleanup) => cleanup());
});

const handleSave = () => {
  if (!signatureApi.value) return;
  const entries = signatureApi.value.exportEntries();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(entries)));
  storedCount.value = entries.length;
  status.value = `Saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`;
};

const handleLoad = () => {
  if (!signatureApi.value) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    status.value = 'No saved signatures found';
    return;
  }
  try {
    const entries = deserializeEntries(JSON.parse(raw));
    signatureApi.value.loadEntries(entries);
    status.value = `Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''}`;
  } catch {
    status.value = 'Failed to load signatures';
  }
};

const handleClearStorage = () => {
  localStorage.removeItem(STORAGE_KEY);
  storedCount.value = 0;
  status.value = 'Storage cleared';
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
          Persistence
        </span>
        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600" />
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            @click="handleSave"
            :disabled="entryCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save :size="14" />
            Save ({{ entryCount }})
          </button>
          <button
            type="button"
            @click="handleLoad"
            :disabled="storedCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload :size="14" />
            Load{{ storedCount > 0 ? ` (${storedCount})` : '' }}
          </button>
          <button
            type="button"
            @click="handleClearStorage"
            :disabled="storedCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 :size="14" />
            Clear Storage
          </button>
        </div>
        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600" />
        <label
          class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"
        >
          <input type="checkbox" v-model="autoSave" class="accent-emerald-500" />
          Auto-save
        </label>

        <span v-if="status" class="text-xs text-gray-500 dark:text-gray-400">
          {{ status }}
        </span>
      </div>
      <div
        v-if="storedCount > 0"
        class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
      >
        <HardDrive :size="12" />
        {{ storedCount }} signature{{ storedCount !== 1 ? 's' : '' }} in localStorage
      </div>
    </div>

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
                documentId: 'signature-doc',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
