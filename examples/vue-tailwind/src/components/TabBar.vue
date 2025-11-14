<template>
  <div class="flex items-end gap-0.5 bg-gray-100 px-2 pt-2">
    <!-- Document Tabs -->
    <div class="flex flex-1 items-end gap-0.5 overflow-x-auto">
      <div
        v-for="document in documentStates"
        :key="document.id"
        @click="() => onSelect(document.id)"
        @keydown="(e) => handleKeyDown(e, document.id)"
        role="tab"
        :tabindex="0"
        :aria-selected="activeDocumentId === document.id"
        :class="[
          'group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium transition-all',
          activeDocumentId === document.id
            ? 'bg-white text-gray-900 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]'
            : 'bg-gray-200/60 text-gray-600 hover:bg-gray-200 hover:text-gray-800',
        ]"
      >
        <!-- Document Icon -->
        <DocumentIcon class="h-4 w-4 flex-shrink-0" title="Document" />

        <!-- Document Name -->
        <span class="min-w-0 flex-1 truncate">
          {{ document.name ?? `Document ${document.id.slice(0, 8)}` }}
        </span>

        <!-- Close Button -->
        <button
          @click.stop="() => onClose(document.id)"
          :aria-label="`Close ${document.name ?? 'document'}`"
          :class="[
            'flex-shrink-0 cursor-pointer rounded-full p-1 transition-all hover:bg-gray-300/50',
            activeDocumentId === document.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ]"
        >
          <CloseIcon class="h-3.5 w-3.5" title="Close" />
        </button>
      </div>

      <!-- Add Tab (Open File) -->
      <button
        @click="onOpenFile"
        class="mb-2 ml-1 flex-shrink-0 cursor-pointer rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-200/80 hover:text-gray-800"
        aria-label="Open File"
        title="Open File"
      >
        <PlusIcon class="h-3.5 w-3.5" title="Open File" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DocumentState } from '@embedpdf/core';
import { DocumentIcon, CloseIcon, PlusIcon } from './Icons.vue';

const props = defineProps<{
  documentStates: DocumentState[];
  activeDocumentId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpenFile: () => void;
}>();

const handleKeyDown = (e: KeyboardEvent, documentId: string) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    props.onSelect(documentId);
  }
};
</script>
