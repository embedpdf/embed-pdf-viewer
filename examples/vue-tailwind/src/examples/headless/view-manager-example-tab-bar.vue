<script setup lang="ts">
import { useOpenDocuments } from '@embedpdf/plugin-document-manager/vue';
import { FileText, X, Plus } from 'lucide-vue-next';

const props = defineProps<{
  documentIds: string[];
  activeDocumentId: string | null;
  canRemoveView: boolean;
}>();

const emit = defineEmits<{
  select: [docId: string];
  removeDocument: [docId: string];
  openFile: [];
  removeView: [];
}>();

const documentStates = useOpenDocuments(() => props.documentIds);

const handleSelect = (e: Event, docId: string) => {
  e.stopPropagation();
  emit('select', docId);
};

const handleRemoveDoc = (e: Event, docId: string) => {
  e.stopPropagation();
  emit('removeDocument', docId);
};

const handleOpenFile = (e: Event) => {
  e.stopPropagation();
  emit('openFile');
};

const handleRemoveView = (e: Event) => {
  e.stopPropagation();
  emit('removeView');
};
</script>

<template>
  <div
    class="flex min-h-[36px] items-center gap-1 border-b border-gray-300 bg-gray-50 px-1 py-1 dark:border-gray-700 dark:bg-gray-800/50"
  >
    <!-- Document Tabs -->
    <div class="flex flex-1 items-center gap-0.5 overflow-x-auto">
      <div
        v-for="doc in documentStates"
        :key="doc.id"
        @click="(e) => handleSelect(e, doc.id)"
        :class="[
          'group flex min-w-0 max-w-[120px] cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-all',
          activeDocumentId === doc.id
            ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-300',
        ]"
      >
        <FileText :size="12" class="flex-shrink-0" />
        <span class="truncate">{{ doc.name || 'Untitled' }}</span>
        <button
          @click="(e) => handleRemoveDoc(e, doc.id)"
          :class="[
            'flex-shrink-0 rounded p-0.5 transition-all hover:bg-gray-200 dark:hover:bg-gray-600',
            activeDocumentId === doc.id
              ? 'opacity-60 hover:opacity-100'
              : 'opacity-0 hover:!opacity-100 group-hover:opacity-60',
          ]"
        >
          <X :size="10" />
        </button>
      </div>

      <span
        v-if="documentStates.length === 0"
        class="px-2 py-1 text-[11px] italic text-gray-500 dark:text-gray-400"
      >
        Empty pane
      </span>
    </div>

    <!-- Actions -->
    <div class="ml-1 flex flex-shrink-0 items-center gap-0.5">
      <button
        @click="handleOpenFile"
        class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
        title="Open file in this pane"
      >
        <Plus :size="14" />
      </button>
      <button
        v-if="canRemoveView"
        @click="handleRemoveView"
        class="rounded p-1 text-gray-500 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        title="Close this pane"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>
