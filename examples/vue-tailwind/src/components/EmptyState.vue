<template>
  <div class="flex flex-1 items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
    <div class="max-w-md text-center">
      <div class="mb-6 flex justify-center">
        <div class="rounded-full bg-indigo-100 p-6">
          <svg
            class="h-16 w-16 text-indigo-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              :stroke-width="1.5"
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              :stroke-width="1.5"
              d="M9 13h6m-6 4h6"
            />
          </svg>
        </div>
      </div>
      <h2 class="mb-3 text-2xl font-bold text-gray-900">No Documents Open</h2>
      <p class="mb-8 text-gray-600">
        Get started by opening a PDF document. You can view multiple documents at once using tabs.
      </p>
      <button
        @click="handleOpenFile"
        class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            :stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Open PDF Document
      </button>
      <div class="mt-6 text-sm text-gray-500">Supported format: PDF</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/vue';

interface Props {
  onDocumentOpened?: (documentId: string) => void;
}

const props = defineProps<Props>();
const { provides } = useDocumentManagerCapability();

const handleOpenFile = () => {
  const openTask = provides.value?.openFileDialog();
  openTask?.wait(
    (result) => {
      props.onDocumentOpened?.(result.documentId);
    },
    (error) => {
      console.error('Open file failed:', error);
    },
  );
};
</script>
