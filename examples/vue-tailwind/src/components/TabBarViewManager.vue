<template>
  <div>
    <div class="flex items-end gap-0.5 bg-gray-100 px-2 pt-2">
      <!-- Document Tabs -->
      <div class="flex flex-1 items-end gap-0.5 overflow-x-auto">
        <div
          v-for="doc in documentStates"
          :key="doc.id"
          @click="() => onSelect(doc.id)"
          @keydown="(e) => handleKeyDown(e, doc.id)"
          @contextmenu="(e) => handleContextMenu(e, doc)"
          role="tab"
          :tabindex="0"
          :aria-selected="doc.id === currentView?.activeDocumentId"
          :class="[
            'group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium transition-all',
            doc.id === currentView?.activeDocumentId
              ? 'bg-white text-gray-900 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]'
              : 'bg-gray-200/60 text-gray-600 hover:bg-gray-200 hover:text-gray-800',
          ]"
        >
          <!-- Document Icon -->
          <DocumentIcon class="h-4 w-4 flex-shrink-0" title="Document" />

          <!-- Document Name -->
          <span class="min-w-0 flex-1 truncate">
            {{ doc.name || 'Untitled' }}
          </span>

          <!-- Close Button -->
          <button
            @click.stop="() => onClose(doc.id)"
            :aria-label="`Close ${doc.name || 'document'}`"
            :class="[
              'flex-shrink-0 cursor-pointer rounded-full p-1 transition-all hover:bg-gray-300/50',
              doc.id === currentView?.activeDocumentId
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100',
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

    <!-- Context Menu -->
    <TabContextMenu
      v-if="contextMenu && currentView"
      :documentState="contextMenu.documentState"
      :currentViewId="currentView.id"
      :position="contextMenu.position"
      :onClose="() => (contextMenu = null)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { DocumentState } from '@embedpdf/core';
import { DocumentIcon, CloseIcon, PlusIcon } from './icons';
import { useOpenDocuments } from '@embedpdf/plugin-document-manager/vue';
import { View } from '@embedpdf/plugin-view-manager/vue';
import TabContextMenu from './TabContextMenu.vue';

const props = defineProps<{
  currentView: View | undefined;
  onSelect: (documentId: string) => void;
  onClose: (documentId: string) => void;
  onOpenFile: () => void;
}>();

const documentStates = useOpenDocuments(() => props.currentView?.documentIds ?? []);
const contextMenu = ref<{
  documentState: DocumentState;
  position: { x: number; y: number };
} | null>(null);

const handleKeyDown = (e: KeyboardEvent, documentId: string) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    props.onSelect(documentId);
  }
};

const handleContextMenu = (e: MouseEvent, doc: DocumentState) => {
  e.preventDefault();
  contextMenu.value = {
    documentState: doc,
    position: { x: e.clientX, y: e.clientY },
  };
};
</script>
